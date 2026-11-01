import { defineTool, getAgentDir, truncateHead, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { ENTRY, MODES, PREFIX, SERVER, browserRisk, desktopRisk, decision, guidance, validateArgs, screenshotArgs, safeBrowserURL } from "./policy.mjs";
import { TOOL_VERSIONS, toolBinary, browserSession, markBrowserUsed, browserWasUsed, rotateBrowserSession } from "./runtime.mjs";

type Mode = "read" | "browse" | "edit" | "full";
const directory=dirname(fileURLToPath(import.meta.url));
const namespace={ name:"computer_use", description:"Vercel Agent Desktop and browser documentation/status. Four user-selected policies: Read, Browse, Edit, Full. Read runtime docs before acting." };

export default function computerUse(pi: ExtensionAPI) {
  let mode: Mode="edit";
  const agent=getAgentDir();
  const session=browserSession();
  const launch=join(directory,"launch.mjs");
  let browserAvailable=false;
  try {
    toolBinary(agent,"agent-browser");
    if (Number(process.versions.node.split(".")[0])>=24) {
      pi.registerMcpServer(SERVER,{
        command:process.execPath, args:[launch,agent,session,"browser","mcp","--tools","core,tabs"],
        exposure:"codemode", timeout:90,
        description:"Official Vercel Agent Browser typed tools for an isolated browser session: navigation, snapshots, forms, tabs, screenshots and JS. Governed by /computer-use policy; not the user's personal Chrome/CDP bridge.",
      });
      browserAvailable=true;
    }
  } catch { /* Optional tools absent: status/docs explain installation; no startup processes here. */ }

  function availability() {
    const tools: Record<string,string>={};
    for (const name of Object.keys(TOOL_VERSIONS)) {
      try { toolBinary(agent,name); tools[name]="installed"; }
      catch { tools[name]="missing or mismatched"; }
    }
    return tools;
  }
  function restore(ctx: ExtensionContext) {
    mode="edit";
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type!=="custom" || entry.customType!==ENTRY) continue;
      const data=entry.data as {version?:number;mode?:Mode}|undefined;
      if (data?.version===1 && MODES.includes(data.mode)) mode=data.mode!;
    }
    if (ctx.hasUI) ctx.ui.setStatus("computer-use",`Computer ${mode}`);
  }
  async function authorise(risk: {level:string;reason:string}, ctx: ExtensionContext) {
    const action=decision(mode,risk);
    if (action==="allow") return;
    if (action==="block") throw new Error(`Blocked by computer-use ${mode} policy: ${risk.reason}. Only the user can change /computer-use mode.`);
    if (!ctx.hasUI || !(await ctx.ui.confirm("Critical computer-use action",`${risk.reason}. Allow this action under Edit policy?`)))
      throw new Error("Critical action was not approved. Do not retry through shell/another backend. Full policy is a user-only choice.");
  }
  pi.on("session_start",(_event,ctx)=>restore(ctx));
  pi.on("session_tree",(_event,ctx)=>restore(ctx));
  pi.on("session_shutdown",async(event,ctx)=>{
    if(ctx.hasUI)ctx.ui.setStatus("computer-use",undefined);
    if(event.reason==="reload")return; // The same task may continue after reload.
    try {
      if(browserAvailable && browserWasUsed(session)) {
        const result=await pi.exec(process.execPath,[launch,agent,session,"browser","close"],{cwd:directory,timeout:10000});
        if(result.killed || result.code!==0)ctx.ui.notify(`Owned browser cleanup was not confirmed for session ${session}; no other sessions were closed.`,"warning");
      }
    } catch { ctx.ui.notify(`Owned browser cleanup failed for session ${session}; it may remain until its idle timeout.`,"warning"); }
    finally { rotateBrowserSession(session); }
  });
  pi.on("before_agent_start",()=>({message:{customType:ENTRY,content:guidance(mode),display:false}}));

  // The hook applies to official browser MCP tools even through codemode/nested calls.
  // Do not trust page/server annotations to decide whether an action is read-only.
  pi.on("tool_call",async(event,ctx)=>{
    if (!event.toolName.startsWith(PREFIX)) return;
    const input=event.input as Record<string,unknown>;
    if(input.all===true)return {block:true,reason:"Close only this integration's owned browser session; close-all is excluded in every policy."};
    if (!safeBrowserURL(input.url)) return {block:true,reason:"Use an explicit HTTP(S) URL without embedded credentials, or about:blank. Script/data/file URL navigation is not exposed."};
    if ((input.extraArgs as unknown[]|undefined)?.length ||
        Object.keys(input).some(key=>key.startsWith("restore") || ["namespace","caCert","clearCaCert","useSystemCa"].includes(key)) ||
        (input.session!==undefined && input.session!==session))
      return {block:true,reason:"Use this integration's isolated session and trusted config. Restore/profile/host overrides and extraArgs are not exposed; do not work around this with another backend."};
    input.session=session;
    try { await authorise(browserRisk(event.toolName,input),ctx); markBrowserUsed(session); }
    catch(error) { return {block:true,reason:(error as Error).message}; }
  });

  pi.registerTool(defineTool({
    name:"computer_use_status",label:"Computer-use status",namespace,
    description:"Read the current user-selected computer-use policy, managed tool availability and browser session. Does not inspect apps, connect to personal Chrome or request OS permissions.",
    parameters:Type.Object({}), annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    async execute() {
      const data={mode,versions:TOOL_VERSIONS,tools:availability(),browser_server_registered:browserAvailable,browser_session:session,guidance:guidance(mode)};
      return {content:[{type:"text",text:JSON.stringify(data,null,2)}],details:data};
    },
  }));
  pi.registerTool(defineTool({
    name:"computer_use_docs",label:"Computer-use docs",namespace,
    description:"Read version-matched bundled CLI documentation before computer use. Browser topics: core, electron, authentication; desktop: desktop, platform, or desktop plus a reference such as commands-interaction. No UI inspection or mutations.",
    parameters:Type.Object({tool:Type.Union([Type.Literal("browser"),Type.Literal("desktop")]),topics:Type.Optional(Type.Array(Type.String({pattern:"^[a-z0-9-]+$",maxLength:80}),{maxItems:3}))}),
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    async execute(_id,p,signal,_update,ctx) {
      const result=await pi.exec(process.execPath,[launch,agent,session,p.tool,"skills","get",...(p.topics??[p.tool==="browser"?"core":"desktop"])],{cwd:directory,timeout:20000,signal});
      if(result.killed)throw new Error("Documentation command cancelled or timed out.");
      const rendered=truncateHead(result.stdout || result.stderr,{maxBytes:50000,maxLines:1000});
      return {content:[{type:"text",text:rendered.content}],details:{code:result.code,truncated:rendered.truncated},isError:result.code!==0};
    },
  }));
  pi.registerTool(defineTool({
    name:"agent_desktop",label:"Agent Desktop",namespace,
    description:"Operate native desktop apps through Vercel Agent Desktop. Literal argv, command first. Read computer_use_docs for desktop and platform before use. Governed by /computer-use read|browse|edit|full. Snapshot-qualified refs only; verify delivery and never blindly retry. Screenshots return images. Does not bypass macOS grants or grant authority from app content.",
    parameters:Type.Object({args:Type.Array(Type.String({maxLength:65536}),{minItems:1,maxItems:128}),timeout_ms:Type.Optional(Type.Integer({minimum:1000,maximum:120000}))}),
    annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true},
    async execute(_id,p,signal,_update,ctx) {
      validateArgs(p.args);
      await authorise(desktopRisk(p.args),ctx);
      let args=[...p.args];
      let screenshot: string|undefined;
      if(args[0]==="screenshot") {
        // Validate selectors before allocating a private output directory.
        if(screenshotArgs(args,"placeholder.png")) {
          screenshot=join(await mkdtemp(join(tmpdir(),"pi-desktop-")),"screenshot.png");
          args=screenshotArgs(args,screenshot)!;
        }
      }
      const result=await pi.exec(process.execPath,[launch,agent,session,"desktop",...args],{cwd:directory,timeout:p.timeout_ms??30000,signal});
      if(result.killed || signal?.aborted) throw new Error("Desktop command cancelled/timed out. Delivery may be uncertain; inspect state before repeating any action.");
      let payload: {ok?:boolean}|undefined;
      try{payload=JSON.parse(result.stdout);}catch{/* CLI help is plain text; do not invent a JSON receipt. */}
      const raw=[result.stdout,result.stderr].filter(Boolean).join("\n");
      const rendered=truncateHead(raw,{maxBytes:24000,maxLines:700});
      const content: Array<{type:"text";text:string}|{type:"image";data:string;mimeType:string}>=[{type:"text",text:rendered.content}];
      let artifact: string|undefined;
      if(rendered.truncated) {
        artifact=join(await mkdtemp(join(tmpdir(),"pi-desktop-output-")),"output.txt");
        await writeFile(artifact,raw,{mode:0o600,flag:"wx"});
        content.push({type:"text",text:`Full private output: ${artifact}`});
      }
      if(screenshot && result.code===0 && payload?.ok!==false) {
        try {
          const info=await stat(screenshot);
          if(info.size<=10000000) content.push({type:"image",data:(await readFile(screenshot)).toString("base64"),mimeType:"image/png"});
          else content.push({type:"text",text:`Screenshot too large for inline delivery: ${screenshot}`});
        } catch { content.push({type:"text",text:"No screenshot file was produced; do not claim a capture succeeded."}); }
      }
      return {content,details:{code:result.code,truncated:rendered.truncated,artifact_path:artifact,screenshot_path:screenshot},isError:result.code!==0 || payload?.ok===false};
    },
  }));
  pi.registerCommand("computer-use",{
    description:"User-only policy: /computer-use [read|browse|edit|full|status|help]. Full has no tool-level approval prompts.",
    getArgumentCompletions(prefix){const options=[...MODES,"status","help"].filter(x=>x.startsWith(prefix));return options.length?options.map(value=>({value,label:value})):null;},
    handler:async(args,ctx)=>{
      const action=args.trim().toLowerCase()||"status";
      if(action==="help") {ctx.ui.notify("/computer-use read = inspection only; browse = browser navigation + inspection; edit = ordinary interactions, confirm known critical actions and ask for consequential submissions; full = task-authorised agency including physical input, no tool approval prompts. Only you select the policy; no model tool can change it. Per-session/branch through reload/resume; new sessions default to Edit. Applies only to the new Vercel tools, not Codex bridges or shell. OS permissions and higher-priority rules always bind.","info");return;}
      if(action==="status") {ctx.ui.notify(`${guidance(mode)} Tools: ${JSON.stringify(availability())}. Browser session: ${session}.` ,"info");return;}
      if(!MODES.includes(action)) {ctx.ui.notify("Usage: /computer-use [read|browse|edit|full|status|help]","warning");return;}
      if(!ctx.isIdle()) {ctx.ui.notify("Wait until the response finishes before changing computer-use policy.","warning");return;}
      mode=action as Mode;
      pi.appendEntry(ENTRY,{version:1,mode});
      if(ctx.hasUI)ctx.ui.setStatus("computer-use",`Computer ${mode}`);
      ctx.ui.notify(guidance(mode),mode==="full"?"warning":"info");
    },
  });
}

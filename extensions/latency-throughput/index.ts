import {
  FooterComponent, type ExtensionAPI, type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { ENTRY, Telemetry, formatMetrics } from "./metrics.mjs";
import { makeFooter } from "./footer.mjs";

export default function latencyThroughput(pi: ExtensionAPI) {
  const telemetry = new Telemetry();
  let enabled = true;
  let installed = false;
  let requestRender: (() => void) | undefined;
  let pendingSample: ReturnType<Telemetry["finish"]>;
  let latestResponse: AssistantMessage | undefined;

  function restoreResponse(ctx: ExtensionContext) {
    latestResponse = ctx.sessionManager.buildSessionProjection().messages.findLast(
      (message): message is AssistantMessage => message.role === "assistant" &&
        message.stopReason !== "error" && message.stopReason !== "aborted",
    );
  }
  function route(ctx: ExtensionContext) {
    // Match native routedModel: only virtual selections annotate the last
    // successful physical response, with its actual dispatched thinking level.
    if (ctx.model?.api !== "pi-virtual" || !latestResponse) return undefined;
    const model = ctx.modelRegistry.find(latestResponse.provider, latestResponse.model);
    return model && model.api !== "pi-virtual" ? {model, thinkingLevel: latestResponse.thinkingLevel} : undefined;
  }
  function identity(ctx: ExtensionContext) {
    if (ctx.model?.api === "pi-virtual" && latestResponse)
      return {provider: latestResponse.provider, api: latestResponse.api, model: latestResponse.model};
    const model = ctx.model;
    return model ? { provider: model.provider, api: model.api, model: model.id } : undefined;
  }
  function install(ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    if (!enabled) {
      if (installed) ctx.ui.setFooter(undefined);
      return;
    }
    ctx.ui.setFooter((tui, theme, footerData) => {
      const component = makeFooter({
        ctx, pi, tui, theme, footerData, telemetry, getRoute: () => route(ctx), getIdentity: () => identity(ctx),
        FooterComponent, visibleWidth, truncateToWidth,
      });
      installed = true;
      requestRender = () => tui.requestRender();
      return {
        invalidate: () => component.invalidate(),
        render: (width: number) => component.render(width),
        dispose() {
          component.dispose();
          installed = false;
          requestRender = undefined;
        },
      };
    });
  }
  function restore(ctx: ExtensionContext) {
    const branch = ctx.sessionManager.getBranch();
    telemetry.restore(branch);
    pendingSample = undefined;
    restoreResponse(ctx);
    enabled = true;
    for (const entry of branch) {
      if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
      const data = entry.data as {version?: number; kind?: string; enabled?: boolean} | undefined;
      if (data?.version === 1 && data.kind === "visibility" && typeof data.enabled === "boolean")
        enabled = data.enabled;
    }
    install(ctx);
  }

  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("model_select", (_event, ctx) => { restoreResponse(ctx); requestRender?.(); });
  pi.on("turn_start", () => { pendingSample = undefined; telemetry.arm(); });
  pi.on("before_provider_request", () => { telemetry.begin(); }); // Never modifies payload/auth.
  pi.on("message_start", event => { telemetry.started(event.message); });
  pi.on("message_update", event => {
    telemetry.update(event.message, event.assistantMessageEvent);
  });
  pi.on("message_end", event => {
    if (event.message.role !== "assistant") return;
    pendingSample = telemetry.finish(event.message);
    if (event.message.stopReason !== "error" && event.message.stopReason !== "aborted")
      latestResponse = event.message;
    requestRender?.();
  });
  // Persist after the assistant/tool entries at the supported turn boundary.
  // Numeric telemetry custom entries are excluded from the model's transcript.
  pi.on("turn_end", event => {
    const sample = pendingSample;
    pendingSample = undefined;
    if (sample) return {
      entries: [...event.entries, { type: "custom" as const, customType: ENTRY, data: {version: 1, kind: "sample", sample} }],
    };
  });
  pi.on("agent_end", () => { telemetry.cancel(); });
  pi.on("session_shutdown", (_event, ctx) => {
    telemetry.cancel(); pendingSample = undefined;
    if (installed && ctx.mode === "tui") ctx.ui.setFooter(undefined);
    requestRender = undefined;
  });

  pi.registerCommand("latency", {
    description: "Footer TTFT/E2E TPS p50/p95 + speed mode: /latency [status|reset|on|off|help]",
    getArgumentCompletions(prefix) {
      const options = ["status", "reset", "on", "off", "help"].filter(value => value.startsWith(prefix));
      return options.length ? options.map(value => ({value, label: value})) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "help") {
        ctx.ui.notify("TTFT is request-hook to first non-empty text/thinking/tool content (not headers or a true server first-token timestamp). Both pairs show nearest-rank p50/p95 over the last 50 successful measured calls per provider/API/model in this branch. E2E TPS is reported output tokens / full request seconds (TTFT + post-first-content time). Including TTFT avoids attributing pre-content hidden reasoning tokens only to the later visible stream. It is not GPU decode speed, a token-weighted average or whole-agent task speed. Missing/zero usage or a nonpositive/nonfinite full interval is omitted from TPS only. Inline speed labels show the /fast preference, not delivered tier; /fast status reports server observations. No per-chunk token guesses. /latency reset clears all buckets while idle; on/off controls visibility, not collection. Restored samples use the E2E formula too. Hidden reasoning, retries, network buffering and client/event processing affect observed timing.", "info");
        return;
      }
      if (action === "status") {
        const id = identity(ctx);
        const stats = telemetry.stats(id);
        ctx.ui.notify(`Latency footer ${enabled ? "ON" : "OFF"}. ${id ? `${id.provider}/${id.model}` : "No model"}: ${formatMetrics(stats)}. TTFT p50/p95: ${stats.count}/50 successful samples; E2E TPS p50/p95: ${stats.tpsCount} valid per-call full-request rates from that same window. Timing samples follow the session branch and survive reload/resume.`, "info");
        return;
      }
      if (action === "reset") {
        if (!ctx.isIdle()) {
          ctx.ui.notify("Wait for the current turn to finish before resetting telemetry.", "warning"); return;
        }
        telemetry.history.clear(); telemetry.cancel(); pendingSample = undefined;
        pi.appendEntry(ENTRY, {version: 1, kind: "reset"});
        requestRender?.();
        ctx.ui.notify("Latency samples reset for all models in this session branch.", "info");
        return;
      }
      if (action === "on" || action === "off") {
        enabled = action === "on";
        pi.appendEntry(ENTRY, {version: 1, kind: "visibility", enabled});
        install(ctx);
        ctx.ui.notify(`Latency footer ${enabled ? "ON" : "OFF"}. Measurements continue either way.`, "info");
        return;
      }
      ctx.ui.notify("Usage: /latency [status|reset|on|off|help]", "warning");
    },
  });
}

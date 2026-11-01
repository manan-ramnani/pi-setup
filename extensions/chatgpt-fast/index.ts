import type {
  ExtensionAPI, ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const ENTRY = "chatgpt-fast-mode";
const STATUS = "chatgpt-fast";
const FAST_TIER = "priority"; // fast/priority remain aliases for ordinary Fast.
const ULTRA_MODELS = new Set(["gpt-6-astra", "gpt-6.1-sol"]);

type Mode = "default" | "fast" | "ultrafast";
type Preference = { version: 2; mode: Mode };
type Receipt = { provider: string; model: string; requested: string; returned?: string };

// Pure endpoint/provider guard: no credentials or response bodies are logged.
export function officialSubscriptionRoute(model: { provider: string; api: string; baseUrl: string } | undefined): boolean {
  if (!model) return false;
  let url: URL;
  try { url = new URL(model.baseUrl); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
  const pathname = url.pathname.replace(/\/+$/, "");
  return (
    model.provider === "openai" && model.api === "openai-responses" &&
    url.hostname === "api.openai.com" && pathname === "/v1"
  ) || (
    model.provider === "openai-codex" && model.api === "openai-codex-responses" &&
    url.hostname === "chatgpt.com" &&
    ["/backend-api", "/backend-api/codex", "/backend-api/codex/responses"].includes(pathname)
  );
}

export default function chatgptFastExtension(pi: ExtensionAPI) {
  // Undefined = new session, no opt-in and no payload changes at all.
  let preference: Preference | undefined;
  let receipt: Receipt | undefined;

  function eligible(ctx: ExtensionContext, mode = preference?.mode): boolean {
    if (!officialSubscriptionRoute(ctx.model) || !ctx.model || !ctx.modelRegistry.isUsingOAuth(ctx.model)) return false;
    // Current documented Responses route and exact supported models only. Never
    // silently turn an unsupported Ultrafast preference into ordinary Fast.
    return mode !== "ultrafast" || (ctx.model.provider === "openai" &&
      ctx.model.api === "openai-responses" && ULTRA_MODELS.has(ctx.model.id));
  }
  function paint(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    if (!preference || preference.mode === "default") { ctx.ui.setStatus(STATUS, undefined); return; }
    const label = preference.mode === "ultrafast" ? "ultrafast" : "fast";
    ctx.ui.setStatus(STATUS, !eligible(ctx) ? `${label}: inactive`
      : receipt?.returned ? `${label}: ${receipt.returned}` : `${label}: on (requested)`);
  }
  function restore(ctx: ExtensionContext) {
    preference = undefined;
    receipt = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
      const data = entry.data as { version?: number; enabled?: boolean; mode?: Mode } | undefined;
      if (data?.version === 1 && typeof data.enabled === "boolean")
        preference = { version: 2, mode: data.enabled ? "fast" : "default" };
      else if (data?.version === 2 && ["default", "fast", "ultrafast"].includes(data.mode ?? ""))
        preference = { version: 2, mode: data.mode! };
    }
    paint(ctx);
  }
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("model_select", (_event, ctx) => {
    receipt = undefined;
    paint(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS, undefined);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!preference || !eligible(ctx)) return;
    const body = event.payload;
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const payload = body as Record<string, unknown>;
    // Only mutate a Responses request for the actually selected model.
    if (payload.model !== ctx.model?.id || !Array.isArray(payload.input)) return;
    const tier = preference.mode === "fast" ? FAST_TIER : preference.mode;
    receipt = { provider: ctx.model.provider, model: ctx.model.id, requested: tier };
    paint(ctx);
    return { ...payload, service_tier: tier };
  });

  pi.on("provider_stream_event", (event, ctx) => {
    if (!receipt || !eligible(ctx) || event.provider !== receipt.provider || event.model !== receipt.model || event.api !== ctx.model?.api) return;
    const data = event.data as { response?: { service_tier?: unknown } } | undefined;
    const tier = data?.response?.service_tier;
    if (typeof tier !== "string" || !["auto", "default", "fast", "priority", "flex", "scale", "ultrafast"].includes(tier)) return;
    receipt.returned = tier;
    paint(ctx);
  });

  pi.registerCommand("fast", {
    description: "ChatGPT speed: /fast [on|ultra|off|status|help] (per session)",
    getArgumentCompletions(prefix) {
      const options = ["on", "ultra", "ultrafast", "off", "status", "help"].filter(value => value.startsWith(prefix));
      return options.length ? options.map(value => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "help") {
        ctx.ui.notify("/fast toggles ordinary Fast/off; /fast on requests priority/Fast; /fast ultra (or ultrafast) requests Ultrafast; /fast off requests standard; /fast status reports requested vs server-reported tier. Ultrafast supports GPT-6 Astra and GPT-6.1 Sol on the current official OpenAI Responses OAuth route. Pro 500 uses included allowance at 8x Standard, then credits at 6x; ordinary Fast uses included allowance at 2.5x. These are usage, not speed guarantees. New sessions have no override; preferences follow this branch through reload/resume. No API-key/proxy/other-provider requests, model/thinking/auth/transport changes, automatic fallback or entitlement claim.", "info");
        return;
      }
      if (action === "status") {
        const desired = preference?.mode === "ultrafast" ? "ULTRAFAST" : preference?.mode === "fast" ? "ON" : "OFF";
        const active = eligible(ctx) ? "eligible ChatGPT subscription route" : "inactive: unsupported model/auth/route for this preference";
        const tier = receipt?.returned
          ? ` Last request: requested ${receipt.requested}, server reported ${receipt.returned}.`
          : receipt ? ` Last request requested ${receipt.requested}; no server tier reported.` : " No tier observation in this runtime yet.";
        ctx.ui.notify(`Fast mode ${desired} for this session (${active}).${tier}`, "info");
        return;
      }
      if (!["", "on", "ultra", "ultrafast", "off"].includes(action)) {
        ctx.ui.notify("Usage: /fast [on|ultra|off|status|help]", "warning"); return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before changing fast mode. An in-flight request cannot change tier.", "warning"); return;
      }
      const mode: Mode = action === "ultra" || action === "ultrafast" ? "ultrafast"
        : action === "on" || (action === "" && (!preference || preference.mode === "default")) ? "fast" : "default";
      if (mode !== "default" && !eligible(ctx, mode)) {
        ctx.ui.notify(mode === "ultrafast"
          ? "Ultrafast wasn't enabled: select GPT-6 Astra or GPT-6.1 Sol on the official OpenAI Responses route using your ChatGPT login. OpenAI must grant your plan/workspace access. No model/auth changes or ordinary-Fast fallback were made."
          : "Fast mode wasn't enabled: choose an official OpenAI model using your ChatGPT login with /model first. No model/auth changes were made. API-key and other-provider requests are intentionally excluded.", "warning");
        return;
      }
      preference = { version: 2, mode };
      receipt = undefined;
      pi.appendEntry(ENTRY, preference);
      paint(ctx);
      ctx.ui.notify(mode === "ultrafast"
        ? "Ultrafast requested for subsequent eligible calls in this session. Pro 500 consumes included usage at 8x Standard, then credits at 6x. OpenAI controls access and actual tier; model/thinking/transport unchanged. Use /fast status to inspect the server-reported tier."
        : mode === "fast"
          ? "Fast mode ON for this session. Subsequent eligible ChatGPT requests ask for priority/Fast service. Model and thinking level are unchanged; OpenAI controls entitlement, actual service, and usage limits."
          : "Fast mode OFF for this session. Subsequent eligible ChatGPT requests ask for standard service.", "info");
    },
  });
}

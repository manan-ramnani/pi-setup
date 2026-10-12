import type {
  ExtensionAPI, ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const ENTRY = "chatgpt-fast-mode";
const STATUS = "chatgpt-fast";
const FAST_TIER = "priority"; // OpenAI accepts fast/priority as Fast-mode aliases.

type Preference = { version: 1; enabled: boolean };
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

  function eligible(ctx: ExtensionContext): boolean {
    return officialSubscriptionRoute(ctx.model) && !!ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model);
  }
  function paint(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    if (!preference?.enabled) { ctx.ui.setStatus(STATUS, undefined); return; }
    const label = !eligible(ctx) ? "fast: inactive"
      : receipt?.returned ? `fast: ${receipt.returned}` : "fast: on (requested)";
    ctx.ui.setStatus(STATUS, label);
  }
  function restore(ctx: ExtensionContext) {
    preference = undefined;
    receipt = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
      const data = entry.data as Partial<Preference> | undefined;
      if (data?.version === 1 && typeof data.enabled === "boolean")
        preference = { version: 1, enabled: data.enabled };
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
    // Only mutate a Responses request for the actually selected model. This
    // avoids touching a different model's payload routed through the same hook.
    if (payload.model !== ctx.model?.id || !Array.isArray(payload.input)) return;
    const tier = preference.enabled ? FAST_TIER : "default";
    receipt = { provider: ctx.model.provider, model: ctx.model.id, requested: tier };
    paint(ctx);
    return { ...payload, service_tier: tier };
  });

  pi.on("provider_stream_event", (event, ctx) => {
    if (!receipt || !eligible(ctx) || event.provider !== receipt.provider || event.model !== receipt.model || event.api !== ctx.model?.api) return;
    const data = event.data as { response?: { service_tier?: unknown } } | undefined;
    const tier = data?.response?.service_tier;
    if (typeof tier !== "string" || !["auto", "default", "fast", "priority", "flex", "ultrafast"].includes(tier)) return;
    receipt.returned = tier;
    paint(ctx);
  });

  pi.registerCommand("fast", {
    description: "Toggle ChatGPT subscription fast service: /fast [on|off|status|help] (per session)",
    getArgumentCompletions(prefix) {
      const options = ["on", "off", "status", "help"].filter(value => value.startsWith(prefix));
      return options.length ? options.map(value => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "help") {
        ctx.ui.notify("/fast toggles; /fast on requests priority/Fast service; /fast off requests standard service; /fast status reports state. New sessions are normal. Preferences follow this session branch and survive reload/resume. Only official OpenAI ChatGPT OAuth routes are affected, not API-key/proxy/other-provider requests. No model or thinking changes. OpenAI decides entitlement and actual tier; usage/rate-limit treatment can differ.", "info");
        return;
      }
      if (action === "status") {
        const desired = preference?.enabled ? "ON" : "OFF";
        const active = eligible(ctx) ? "eligible ChatGPT subscription route" : "inactive: select an official OpenAI model with ChatGPT OAuth";
        const tier = receipt?.returned
          ? ` Last request: requested ${receipt.requested}, server reported ${receipt.returned}.`
          : receipt ? ` Last request requested ${receipt.requested}; no server tier reported.` : " No tier observation in this runtime yet.";
        ctx.ui.notify(`Fast mode ${desired} for this session (${active}).${tier}`, "info");
        return;
      }
      if (!["", "on", "off"].includes(action)) {
        ctx.ui.notify("Usage: /fast [on|off|status|help]", "warning"); return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before changing fast mode. An in-flight request cannot change tier.", "warning"); return;
      }
      const enabled = action === "on" || (action === "" && !preference?.enabled);
      if (enabled && !eligible(ctx)) {
        ctx.ui.notify("Fast mode wasn't enabled: choose an official OpenAI model using your ChatGPT login with /model first. No model/auth changes were made. API-key and other-provider requests are intentionally excluded.", "warning");
        return;
      }
      preference = { version: 1, enabled };
      receipt = undefined;
      pi.appendEntry(ENTRY, preference);
      paint(ctx);
      ctx.ui.notify(enabled
        ? "Fast mode ON for this session. Subsequent eligible ChatGPT requests ask for priority/Fast service. Model and thinking level are unchanged; OpenAI controls entitlement, actual service, and usage limits."
        : "Fast mode OFF for this session. Subsequent eligible ChatGPT requests ask for standard service.", "info");
    },
  });
}

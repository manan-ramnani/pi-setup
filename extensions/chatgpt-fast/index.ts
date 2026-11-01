import type {
  ExtensionAPI, ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const ENTRY = "chatgpt-fast-mode";
const STATUS = "chatgpt-fast";
const FAST_TIER = "priority"; // fast/priority remain aliases for ordinary Fast.
const ULTRA_MODELS = new Set(["gpt-6-astra", "gpt-6.1-sol"]);

type Mode = "default" | "fast" | "ultrafast";
const SPEED_CHOICES = ["standard", "fast", "ultrafast"];
const MODE_LABELS: Record<Mode, string> = { default: "Standard", fast: "Fast", ultrafast: "Ultrafast" };
const COMMAND_MODES: Record<string, Mode> = { standard: "default", fast: "fast", ultrafast: "ultrafast", off: "default", on: "fast", ultra: "ultrafast" };
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
    description: "Choose ChatGPT speed: /fast [standard|fast|ultrafast] (status/help available)",
    getArgumentCompletions(prefix) {
      // Three distinct tiers; aliases remain accepted but never appear as tiers.
      const options = (prefix ? [...SPEED_CHOICES, "status", "help"] : SPEED_CHOICES).filter(value => value.startsWith(prefix));
      return options.length ? options.map(value => ({ value, label: value === "status" ? "Status (inspect requested/delivered tier)" : value === "help" ? "Help (usage and eligibility)" : MODE_LABELS[COMMAND_MODES[value]] })) : null;
    },
    handler: async (args, ctx) => {
      let action = args.trim().toLowerCase();
      if (action === "help") {
        ctx.ui.notify("/fast opens three choices: Standard, Fast and Ultrafast. Or use /fast standard, /fast fast, /fast ultrafast; /fast status reports requested vs server-reported tier. Standard uses default service; Fast requests priority service. For supported subscription models, Fast consumes included allowance at 2.5x Standard; purchased credits at 2x. Ultrafast consumes included allowance at 8x and credits at 6x, on eligible plans with GPT-6 Astra or GPT-6.1 Sol on the current official OpenAI Responses OAuth route. Usage multipliers are not speed guarantees. Old on/off/ultra commands remain hidden aliases, not extra tiers. New sessions have no override; preferences follow this branch through reload/resume. No API-key/proxy/other-provider requests, model/thinking/auth/transport changes, automatic fallback or entitlement claim.", "info");
        return;
      }
      if (action === "status") {
        const desired = preference ? MODE_LABELS[preference.mode] : "provider default (no override)";
        const active = eligible(ctx) ? "eligible ChatGPT subscription route" : "inactive: unsupported model/auth/route for this preference";
        const tier = receipt?.returned
          ? ` Last request: requested ${receipt.requested}, server reported ${receipt.returned}.`
          : receipt ? ` Last request requested ${receipt.requested}; no server tier reported.` : " No tier observation in this runtime yet.";
        ctx.ui.notify(`ChatGPT speed: ${desired} for this session (${active}).${tier}`, "info");
        return;
      }
      if (action && !Object.hasOwn(COMMAND_MODES, action)) {
        ctx.ui.notify("Usage: /fast [standard|fast|ultrafast|status|help]", "warning"); return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before changing fast mode. An in-flight request cannot change tier.", "warning"); return;
      }
      if (!action) {
        if (!ctx.hasUI) {
          ctx.ui.notify("Choose explicitly: /fast standard, /fast fast or /fast ultrafast. Current preference unchanged.", "info"); return;
        }
        const labels = ["Standard", "Fast", "Ultrafast"];
        const current = preference ? MODE_LABELS[preference.mode] : "provider default (no override)";
        const selected = await ctx.ui.select(`ChatGPT speed — current: ${current}`, labels);
        if (!selected || !labels.includes(selected)) return;
        action = SPEED_CHOICES[labels.indexOf(selected)];
        if (!ctx.isIdle()) {
          ctx.ui.notify("Speed preference unchanged: a response started while the selector was open.", "warning"); return;
        }
      }
      const mode: Mode = COMMAND_MODES[action];
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
        ? "Ultrafast requested for subsequent eligible calls in this session. Eligible included usage is consumed at 8x Standard, purchased credits at 6x. OpenAI controls access and actual tier; model/thinking/transport unchanged. Use /fast status to inspect the server-reported tier."
        : mode === "fast"
          ? "Fast requested for this session: priority service, 2.5x included usage or 2x purchased credits for supported subscription models. Model/thinking unchanged; OpenAI controls entitlement and actual tier."
          : "Standard requested for this session. Subsequent eligible ChatGPT requests ask for default service.", "info");
    },
  });
}

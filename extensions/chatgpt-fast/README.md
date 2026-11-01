# ChatGPT Fast and Ultrafast in Pi

Per-session speed preference for official ChatGPT OAuth requests. This extension never changes model, thinking level, credentials or transport, and never affects API-key requests.

## Usage

```text
/reload
/fast ultra
/fast status
```

| Command | Behaviour |
| --- | --- |
| `/fast` | Toggle ordinary Fast/off; if Ultra is selected, turn it off. Never opts into Ultra implicitly. |
| `/fast on` | Request ordinary Fast (`service_tier: "priority"`). |
| `/fast ultra` or `/fast ultrafast` | Request Ultrafast (`service_tier: "ultrafast"`). |
| `/fast off` | Explicitly request Standard (`service_tier: "default"`). |
| `/fast status` | Report preference and last requested/server-reported tier. |
| `/fast help` | Explain scope, usage implications and limitations. |

Use `/model` to select **OpenAI / GPT-6.1 Sol** or **OpenAI / GPT-6 Astra**, authenticated with ChatGPT, before selecting Ultra. Commands that change the preference require idle; an already-sent request cannot change tier.

**New sessions have no override.** The preference follows the active branch through reload, resume and tree navigation. Version-2 entries store `mode: default|fast|ultrafast`; old version-1 boolean entries restore as ordinary Fast/off. Invalid entries are ignored. No tokens or prompt data are stored.

## Eligibility and request behaviour

The `before_provider_request` hook shallow-copies an eligible Responses payload and changes only `service_tier`. It requires OAuth authentication, matching selected model ID and an input array.

Ordinary Fast/off supports:

- `openai` / `openai-responses` at official `https://api.openai.com/v1`;
- legacy `openai-codex` / `openai-codex-responses` at the official ChatGPT backend.

**Ultrafast is limited to the current `openai` / `openai-responses` route and exact model IDs `gpt-6-astra` and `gpt-6.1-sol`.** We do not assume aliases, future models or legacy transport support. On an unsupported selection, an inherited Ultra preference becomes inactive and leaves requests untouched; it does not silently downgrade to Fast. API keys, proxies, other providers/APIs and malformed/different-model payloads remain untouched.

### Current official requirements

Checked 1 November 2026:

- [Ultrafast API guide](https://developers.openai.com/api/docs/guides/ultrafast-mode): set `service_tier: "ultrafast"`; HTTP and WebSockets are supported. A persistent WebSocket is recommended for tool-heavy latency, not required. The current HTTP examples do **not** require an `OpenAI-Service-Tier` header; the older alpha FAQ's header requirement is not used here.
- [Codex speed guide](https://developers.openai.com/codex/speed/): Pro 500 and eligible Enterprise/Edu accounts support GPT-6 Astra and GPT-6.1 Sol Ultra. On Pro 500, included allowance is consumed at **8× Standard**, then available credits at **6× Standard**. Ordinary Fast consumes included allowance at **2.5× Standard**, with credits at **2×**. These multipliers describe consumption, not guaranteed speed.
- [About ChatGPT Pro tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): Pro 100/200 do not unlock Ultra by purchasing credits.
- [Fast API guide](https://developers.openai.com/api/docs/guides/fast-mode): `priority` and `fast` remain ordinary Fast aliases, not Ultra.

ChatGPT plan access and API-key billing are different. The extension neither verifies billing/plan status nor buys credits. OpenAI controls entitlement, capacity, usage limits and actual tier. It does not silently retry at a different tier or suppress provider errors.

Pi 1.4.0's current OpenAI Responses implementation uses HTTP/SSE. This extension preserves it; it does not install a WebSocket transport, change auth flows or patch Pi core. Its effect is limited to requests passing through this session's provider hook, not independently spawned agent runtimes or the Codex app.

## Requested versus delivered

The native status shows `ultrafast: on (requested)` or `fast: on (requested)`, then the server's `response.service_tier` when reported. `/fast status` distinguishes requested Ultra from a returned `default`/other tier, or absence of a server receipt. Receipts reset on reload and model changes; they are never invented.

With the `latency-throughput` footer, the status is moved inline: `Ultra requested`, `Ultra requested (inactive)`, `Fast on`, `Fast on (inactive)` or `Fast off`. These labels describe the preference, **not proof of delivered tier**. Inspect `/fast status` after a response.

## Validation and activation

```sh
node extensions/chatgpt-fast/tests.mjs
```

Tests use Pi's real extension loader and OpenAI transport with mocked HTTP. They cover Ultra serialization, preservation of input/tools/reasoning, all mode transitions, supported model/auth/endpoint guards, unsupported-mode inactivity, no fallback, v1 migration, branch/reload/new-session state, receipt/default handling and busy protection. No credentials or real inference are used.

Reload an existing Pi session with `/reload`; then opt in with `/fast ultra`. Merely changing the files does not activate Ultra or prove account entitlement. Tests passed on the pinned Pi 1.1.0 test host and installed Pi 1.4.0; live entitlement/speed remain unverified.

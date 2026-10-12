# ChatGPT Fast mode

Loaded by this repository's Pi package manifest; command: `/fast [on|off|status|help]`.

New sessions begin with no preference and no payload changes. `/fast on` requests `service_tier: priority` for subsequent eligible requests; `/fast off` requests standard service. Preferences survive reload/resume and follow the active session branch.

Eligibility requires an official OpenAI ChatGPT OAuth route, the Responses API, and a request matching the selected model. API-key requests, proxies, other providers/APIs, malformed payloads, and different-model payloads are not modified. An enabled preference becomes inactive on an unsupported route. No model, thinking, auth, headers, tools, transport, or global settings are changed.

The status distinguishes requested from server-reported service tier, including fallback to default. The telemetry footer moves the toggle into its metrics line without a duplicate status row. That inline label is a preference, not proof of delivered tier.

OpenAI decides account/model entitlement, actual tier, capacity, latency, and usage/rate-limit treatment. This extension does not grant entitlement, guarantee speed, silently retry failures, or affect independent agent runtimes. Changing the toggle while a response is busy is blocked.

## Validate

From the repository root:

```sh
node extensions/chatgpt-fast/tests.mjs
```

Tests use the actual Pi extension loader and OpenAI request transport with mocked HTTP. They cover serialization, state restoration, route/auth isolation, request preservation, reported-tier display, malformed inputs, and busy-state behavior. They do not read credentials or make provider requests.

Use `pi config` to disable this package resource, then `/reload`.

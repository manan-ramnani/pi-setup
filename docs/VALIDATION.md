# Validation scope

The setup was exported from Pi 1.1.0 on macOS. Publication excludes the macOS-only Codex MCP integrations.

## Automated checks

- Snapshot and lockfile consistency; exact top-level package versions.
- Settings merge idempotency, unrelated preference preservation, duplicate/unrelated-package guards.
- Dry run writes nothing and does not read/copy credentials.
- Skill snapshot hashes and customization application.
- ChatGPT Fast/Ultrafast request behaviour against a mocked OpenAI transport, exact-model gates, requested/returned tier distinction and version-1 preference restoration.
- TTFT and end-to-end output TPS maths, nearest-rank percentiles, hidden-reasoning wait/single-burst cases, persistence, native footer layout/accounting, headless behaviour and isolated discovery.
- Parallel argument arrays, safety/confirmation behavior, artifacts, errors and cancellation using Node as a portable fake CLI.
- Computer-use Read/Browse/Edit/Full matrix, user-only branch-persisted selection, mode-specific model guidance, critical/headless behaviour and Full without confirmation prompts.
- Fake native-tool argv/image/error/timeout/artifact handling, credential-free child environment, pinned managed binary/helper preparation, owned-session isolation/lifecycle and non-writing optional-installer preview.
- Heuristic publication secret/path/binary audit.

The custom test harnesses use file URLs for dynamic imports and resolve Pi/dependencies locally or globally. Discovery tests use a temporary agent directory, never the author's real agent directory. Unix shebang execution is not required for the fake CLI.

## Platform coverage

GitHub Actions defines Node 22/24 tests on ubuntu-latest, windows-latest, and macos-latest. The optional real browser requires Node 24+ and is not installed or launched by CI; the base suite also checks its absence on supported older Node. A configured matrix is not evidence that the latest run passed: inspect the run before relying on native Windows compatibility.

WSL is expected to behave like Linux but is not itself a hosted CI target. Live authentication, model availability/Fast entitlement, terminal image protocols, browser/PDF rendering, Herdr, and every third-party workflow require target-machine checks.

## Publication verification

The initial publication runs the offline suites, restores pinned upstream skill snapshots into a temporary destination and verifies their hashes, installs the third-party npm snapshot in an isolated agent directory, and checks registration without making provider calls.

The [latest published-revision CI run](https://github.com/manan-ramnani/pi-setup/actions/runs/38317648385) passed all three OS jobs on 13 October 2026 IST. That result predates the Ultra/E2E/computer-use changes. Check the [current revision's Actions run](https://github.com/manan-ramnani/pi-setup/actions) for the expanded matrix.

## 1 November 2026 extension update

The full offline setup, Fast/Ultra, telemetry, Parallel and computer-use fake-CLI suites pass locally on both the pinned Pi **1.1.0** test host and the installed Pi **1.4.0** host (`PI_MODULE_ROOT` override). The active standalone Fast/telemetry copies also pass their offline suites. The publication audit reports zero findings. Existing Pi/third-party dependency pins, auth/config, model selection and default speed setting were not changed. Optional Vercel tools have their own new manifest/lockfile.

Ultra's mocked HTTP/SSE test verifies `service_tier: "ultrafast"`, no obsolete alpha routing header, model/input preservation and no assumption of legacy-route Ultra support. This is request-construction evidence, **not** a real subscription entitlement, server-tier or latency test. No live model inference or paid research job was submitted.

The explicit opt-in `scripts/test-computer-use-live.mjs` passed with the installed pinned CLIs on macOS: official browser MCP handshake, 35 core/tabs typed tools, a local HTTP fixture opened in a separate Chrome session, snapshot, input fill, Save click, verified result and an MCP screenshot image. Only that owned browser was closed. A short owner-only Unix socket directory avoids macOS socket-path limits. No personal Chrome profile/CDP connection was used.

Desktop 1.0.2's status passed: Accessibility **denied**, Screen Recording **denied**, Automation **unknown**. Its same-release bundled helper was checksum-checked and prepared without lifecycle scripts. No desktop app contents were inspected and no OS permissions were granted. App interaction, macOS screenshots, and Windows/Linux live GUI behaviour remain explicit target-machine gates. Installation alone is not proof of functionality.

The default suites never launch a real browser/native app, read credentials, call providers or submit paid jobs. The live smoke is deliberately separate. The new policy is cooperative gating, not OS isolation and not a global guard over shell/Codex. Full removes tool-level confirmations within task scope; it cannot grant missing OS access or override higher-priority/project constraints.

The public documentation review used live web search/fetch. One Parallel search wrapper returned a JSON parsing error; direct CLI search with bounded excerpts and subsequent fetches worked. Its cause is unconfirmed and not covered by current offline tests. The main README records this follow-up rather than claiming complete live-tool validation.

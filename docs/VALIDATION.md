# Validation scope

The setup was exported from Pi 1.1.0 on macOS. Publication excludes the macOS-only Codex MCP integrations.

## Automated checks

- Snapshot and lockfile consistency; exact top-level package versions.
- Settings merge idempotency, unrelated preference preservation, duplicate/unrelated-package guards.
- Dry run writes nothing and does not read/copy credentials.
- Skill snapshot hashes and customization application.
- ChatGPT Fast-mode request behavior against a mocked OpenAI transport.
- Telemetry math, persistence, native footer layout/accounting, headless behavior, and isolated extension discovery.
- Parallel argument arrays, safety/confirmation behavior, artifacts, errors and cancellation using Node as a portable fake CLI.
- Heuristic publication secret/path/binary audit.

The custom test harnesses use file URLs for dynamic imports and resolve Pi/dependencies locally or globally. Discovery tests use a temporary agent directory, never the author's real agent directory. Unix shebang execution is not required for the fake CLI.

## Platform coverage

GitHub Actions defines Node 24 tests on ubuntu-latest, windows-latest, and macos-latest. A configured matrix is not evidence that the latest run passed: inspect the run before relying on native Windows compatibility.

WSL is expected to behave like Linux but is not itself a hosted CI target. Live authentication, model availability/Fast entitlement, terminal image protocols, browser/PDF rendering, Herdr, and every third-party workflow require target-machine checks.

## Publication verification

The initial publication runs the offline suites, restores pinned upstream skill snapshots into a temporary destination and verifies their hashes, installs the third-party npm snapshot in an isolated agent directory, and checks registration without making provider calls.

Review CI after the first push for actual Linux/Windows runner results. No paid research or live inference is needed to validate the repository.

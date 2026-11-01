# Pi setup

Portable, sanitized snapshot of a personal **Pi 1.1.0** setup for macOS, WSL/Linux, and native Windows.

This is executable extension code, not just preferences. Review it and the third-party sources before installing. The repository never includes credentials, OAuth state, sessions, generated model stores, personal absolute paths, compiled binaries, or node_modules.

## Included

- **chatgpt-fast**: per-session `/fast standard|fast|ultrafast` preference for eligible official ChatGPT OAuth routes. Ultrafast supports GPT-6 Astra and GPT-6.1 Sol on the current OpenAI Responses route. It requests a tier; it does not guarantee entitlement or performance.
- **latency-throughput**: native-footer integration showing client-observed TTFT and **end-to-end output TPS** p50/p95, plus the Fast/Ultra preference.
- **parallel**: public search, fetch/extract, and confirmed paid asynchronous research through Parallel CLI 0.9.3.
- **computer-use**: optional official Vercel Agent Browser MCP and native Agent Desktop tools, with user-selected Read/Browse/Edit/Full approval modes.
- **parallel-web**, **agent-browser**, **agent-desktop** discovery skills and customized skill routing instructions.
- Eight pinned third-party Pi packages and their captured npm dependency lockfile.
- Five third-party skill source revisions, snapshot checksums, and a downloader.
- Sanitized startup/model preferences and recap configuration.
- Bash/PowerShell bootstrap wrappers, a doctor command, offline tests, and a publication audit.

**Not included:** the macOS-only Codex Chrome/computer-use MCP bridges, their browser skill, account state or native binaries. Existing local bridges are preserved. Vercel tooling is a separate opt-in backend for macOS, Windows and Linux, subject to platform/permission checks. `config/mcp.portable.json` intentionally has no file-configured servers; the optional browser server is registered by the extension.

## Prerequisites

- Node.js **22.19+**, with npm. Optional Vercel browser/desktop installation requires **Node 24+**. Offline CI covers Node 22/24; the original host used Node 26.7.0.
- Git, if downloading the optional upstream skills.
- Native Windows: Git for Windows for Pi's default Bash tool; Windows Terminal is a convenient terminal.
- Optional: [uv](https://docs.astral.sh/uv/) and Python 3.10+ for the Python-distributed Parallel CLI.

Use separate installations and config/dependency directories for WSL and native Windows. In WSL, install Linux Node and tools and keep this checkout on the Linux filesystem, not a shared Windows node_modules directory.

## Install on WSL/Linux/macOS

```bash
git clone https://github.com/manan-ramnani/pi-setup.git
cd pi-setup

# Preview without writing files or making network requests:
bash scripts/bootstrap.sh --dry-run --agent-dir ~/.pi/agent

# Fresh-machine install:
bash scripts/bootstrap.sh --install-pi --with-skills

# Also install Parallel through uv, if uv/Python are available:
# bash scripts/bootstrap.sh --install-pi --with-skills --with-parallel
```

## Install on native Windows

In PowerShell:

```powershell
git clone https://github.com/manan-ramnani/pi-setup.git
Set-Location pi-setup

node scripts/bootstrap.mjs --dry-run

# Equivalent PowerShell wrapper:
.\scripts\bootstrap.ps1 --install-pi --with-skills

# Optional, with uv/Python installed:
# .\scripts\bootstrap.ps1 --install-pi --with-skills --with-parallel
```

If local policy blocks the wrapper, use `node scripts/bootstrap.mjs` with the same flags. No execution-policy change is necessary.

### What bootstrap does

1. Checks prerequisites and rejects conflicting auto-discovered custom extensions or unrelated npm dependencies.
2. With `--install-pi`, installs the pinned global Pi version using npm. This flag can change an existing global Pi installation.
3. Installs the captured third-party dependency graph into a staging directory with `npm ci --ignore-scripts --legacy-peer-deps`.
4. With `--with-skills`, downloads pinned upstream revisions, applies the original custom edits, checks snapshot hashes, then installs them under the agent directory.
5. Backs up existing settings and the managed npm directory under `<agent-dir>/.pi-setup-backups/`.
6. Registers this checkout as a local Pi package and merges pinned package declarations. Existing model/UI preferences and unrelated local/git packages are preserved.
7. Copies recap preferences and the empty MCP template **only when those files do not already exist**.
8. Leaves auth files, sessions, existing MCP servers, and unrelated skills untouched.

Without `--install-pi`, Pi 1.1.0 must already be on PATH. Without `--with-skills`, only this package's own Parallel/browser/desktop discovery skills are added. Without `--with-parallel`, install the CLI separately.

**Stop running Pi while changing its dependency directory.** Keep this checkout at a stable location: Pi loads local package resources in place. The full installer is not a transactional system; backups cover settings/npm, while optional global-tool and skill installation are separate operations.

### Existing setups and isolated profiles

If the old custom extensions are already under `~/.pi/agent/extensions/`, bootstrap refuses rather than registering them twice. Back up/remove the old copies yourself, or use a separate agent directory:

```bash
node scripts/bootstrap.mjs --install-pi --agent-dir ~/.pi/portable-agent
PI_CODING_AGENT_DIR=~/.pi/portable-agent pi
```

PowerShell equivalent:

```powershell
node scripts/bootstrap.mjs --install-pi --agent-dir "$HOME/.pi/portable-agent"
$env:PI_CODING_AGENT_DIR = "$HOME/.pi/portable-agent"
pi
```

Existing `~/.agents/skills/` skills are also auto-discovered by Pi. If they duplicate the optional downloaded skills, omit `--with-skills` or resolve those duplicates first.

## Authenticate locally

Start Pi and use `/login`, then `/model`. Do not copy auth.json between machines or commit it here.

The captured defaults are Baseten / `zai-org/GLM-5.2`; model availability and authorization depend on your account. The recap preference is OpenAI / `gpt-6-luna`. Select alternatives locally if unavailable. Existing preferences are not overwritten by bootstrap.

For Parallel:

```bash
uv tool install parallel-web-tools==0.9.3
parallel-cli login
```

This installs the same CLI version through its Python distribution rather than copying the original macOS standalone binary. Add uv's tool bin directory to PATH. If necessary, set `PI_PARALLEL_CLI` to the actual executable, including `.exe` on Windows.

The extension also supports `PI_PARALLEL_CLI_ARGS` as a JSON array of prefix arguments, useful for a script launcher. It never interpolates a shell command. See [the extension README](extensions/parallel/README.md).

Search/extraction may consume credits. Real research jobs require interactive approval. Cancelling local waiting does not cancel a submitted remote job. No bootstrap, doctor, or default test submits research.

## Optional browser and desktop tools

```sh
# Separate, pinned tools; does not replace global CLIs or existing MCP bridges:
node scripts/setup-computer-use.mjs --dry-run
node scripts/setup-computer-use.mjs --install-browser
```

The optional lockfile pins **agent-browser 0.41.1** and **agent-desktop 1.0.2** under `<agent-dir>/computer-use/vercel`. `--install-browser` downloads Chrome for Testing; omit it if that browser is already installed. Add `--agent-dir PATH` for another profile. This does not grant OS permissions or inspect apps.

After `/reload`, the user chooses:

| Command | Delegated authority |
| --- | --- |
| `/computer-use read` | Inspection only. |
| `/computer-use browse` | Browser navigation and inspection, no form edits or arbitrary clicks. |
| `/computer-use edit` | **Default:** normal task-authorised edits/clicks; confirm known critical actions. |
| `/computer-use full` | Task-authorised agency, including clicks, edits, saving and physical input, with **no tool-level approval prompts** for critical actions. |
| `/computer-use status` | Availability, selected mode and browser session. |

If upgrading the initial layout, run `node scripts/setup-computer-use.mjs --migrate-only`: it moves this installer's marked `tools/vercel` directory and its managed backups, preserves installed dependencies, refuses collisions/unmanaged directories, and removes `tools/` only when empty. This fixes Pi's legacy-tools startup warning without suppressing it or moving unrelated tools. Reload Pi afterwards.

The model receives mode-specific instructions; only the user can change modes. Mode follows the session branch and survives reload/resume; a new session starts in Edit. Full does not override OS permissions, task scope, higher-priority/project restrictions or untrusted-content rules. In Edit, the model must ask before consequential purchases, messages, deletions or submissions: the gate cannot infer every generic click's meaning. These are cooperative controls on the Vercel tools, **not an OS sandbox** or a global gate over Bash/Codex bridges. Never bypass a policy refusal through another backend.

The browser uses its own namespace/session and trusted config, not personal Chrome. `/mcp` shows extension-registered `vercel-browser`; shell `pi mcp list` does not load it. Core/tabs typed tools are available through codemode/tool search; desktop uses `agent_desktop`. `computer_use_docs` provides the installed CLI's version-matched workflow/platform docs.

**Verified locally:** isolated browser open/snapshot/fill/click/verify/screenshot against an owned HTTP fixture, plus desktop status. **Still gated:** macOS Accessibility and Screen Recording were denied, so native app interaction/screenshots remain unverified until the user manually grants them. No permissions were changed. Linux/Windows live GUI behaviour is not established by offline CI. See [integration details, risks and troubleshooting](extensions/computer-use/README.md).

## Optional preview and skill dependencies

| Feature | Requirements |
|---|---|
| Markdown/HTML preview | Pandoc |
| PNG/terminal preview | Chromium-based browser accessible to the Pi process |
| PDF export | LaTeX engine (xelatex by default) and supporting packages |
| Mermaid in PDFs | Optional Mermaid CLI |
| Nanobanana | Python, google-genai, Pillow, python-dotenv, and Gemini credentials |
| Herdr | The corresponding Herdr environment; otherwise its extension is inactive |

For WSL PNG rendering, use a Linux browser or a deliberately configured compatible renderer—not an assumption that Windows Chrome is interchangeable. `PUPPETEER_EXECUTABLE_PATH`, `PANDOC_PATH`, and `PANDOC_PDF_ENGINE` can override detection.

The Nanobanana downloader replaces its Claude plugin path placeholders with `<skill-directory>` instructions after snapshot verification. Resolve that placeholder from the skill location shown by Pi; use `python` on Windows when needed.

Terminal image/keyboard capabilities vary. Browser previews and file exports work around lack of inline image support. In Windows Terminal, configure modified Enter forwarding using [Pi's Windows docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md). `Ctrl+J` is a newline alternative.

## Verify

```bash
node scripts/doctor.mjs
pi list

# Install the development/test host without relying on global Pi:
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run audit
```

For another profile, pass `--agent-dir PATH` to doctor. If testing an unusual Pi installation, set `PI_MODULE_ROOT` to its package directory.

Inside Pi:

```text
/fast status
/latency status
/parallel status
/computer-use status

# After selecting OpenAI / GPT-6.1 Sol or GPT-6 Astra with ChatGPT OAuth:
/fast
# Picker: Standard, Fast, Ultrafast; cancelling changes nothing.
# Direct: /fast standard, /fast fast, /fast ultrafast
```

Also exercise agent spawning, oracle, task persistence, ask-user dialogs, and preview export after authenticating. Offline tests verify the custom behavior without provider calls, account entitlement checks, or subscription quota. Optional Parallel `--live` tests make two public requests and may consume credits; they are never part of the default suite.

CI runs offline tests on Linux, macOS, and Windows. CI does not verify live providers, desktop integration, every terminal, or WSL specifically. See [validation notes](docs/VALIDATION.md).

## Reproducibility and updates

- Pi and the eight package versions are pinned in `versions.json`.
- `config/npm/package-lock.json` captures the original third-party dependency graph; npm selects platform-appropriate optional dependencies.
- The repository's root lockfile pins the development/test host.
- `config/computer-use/package-lock.json` separately pins the optional Vercel CLIs; no binaries, browser profiles or OS grants are committed.
- Skills are fetched at exact source commits and checked against the original customized snapshots.
- Global Pi's npm installation pins its top-level release but may resolve newer transitive dependencies than the development lockfile.
- The optional Python CLI installation pins its package version, not every Python transitive dependency.
- Account permissions, remote model catalogs, and service behavior are not frozen.

Do not run bulk package updates if you want to preserve the snapshot. Update deliberately, regenerate lockfiles, rerun tests on target platforms, and commit the reviewed changes.

## Maintenance status and installation parity

Reviewed **1 November 2026**. This repository is a manually maintained portable snapshot, not an automatic mirror of the original machine. That machine currently loads standalone extension copies from `~/.pi/agent/extensions`, not this package. Updating one does not automatically update the other. This change updates Fast/Ultra, telemetry and the new computer-use extension/skills in both locations; it does not reconfigure package loading or bulk-upgrade existing dependencies.

The previous published revision was `7ec68d8` (13 October 2026 IST), with a [passing three-OS offline CI run](https://github.com/manan-ramnani/pi-setup/actions/runs/38317648385). This update adds Node 22/24 coverage across the same platforms. Check the [current Actions run](https://github.com/manan-ramnani/pi-setup/actions) for this revision rather than treating the older result as current evidence.

| Component | Pinned portable snapshot | Original machine at review |
| --- | --- | --- |
| Pi | 1.1.0 | 1.4.0 |
| pi-agents | 0.26.1 | 0.38.1 |
| pi-oracle | 0.1.30 | 0.1.33 |
| pi-tasks | 0.9.0 | 0.9.1 |
| pi-ask-user | 0.16.0 | 0.17.1 |
| pi-markdown-preview | 0.21.3 | 0.26.2 |
| Parallel CLI | 0.9.3 | 0.9.4 |

Recap 0.4.8, Herdr 0.1.2 and side-chat 0.4.0 match. Both have the same eight package families; newer installed package versions are not a proof that every workflow has been exercised. Model defaults and recap configuration match; the portable base additionally enables codemode explicitly.

### What differs

- **Now synchronised:** Fast/Ultra request logic, client-observed TTFT/E2E TPS code and the optional computer-use integration/skills. Repo tests use portable dependency discovery; original-machine tests use its installed host. Both hosts pass the relevant offline suites.
- **Machine-only:** authenticated macOS Codex Chrome and computer-use MCP integrations and their browser skill. These were intentionally excluded from the portable package, not lost. The new optional Vercel backend is separate and does not replace or modify them.
- **Repo-only tooling:** pinned dependencies, bootstrap/doctor/publication audit, skill revision/checksum installer, cross-platform CI, and Parallel `.exe` discovery plus `PI_PARALLEL_CLI_ARGS` launcher support. The original machine's standalone Parallel extension lacks those two portability features.
- **Not shared:** credentials, sessions, account state, generated model stores and project-specific tools/instructions. They must remain local.
- **Observed unresolved issue:** one live Parallel search wrapper returned a non-JSON parsing error during this review; a bounded direct CLI search and fetches worked. Its cause is not established and offline fake-CLI tests do not reproduce it. No Parallel code was changed here.

### Recommended next maintenance work

1. Deliberately refresh the pinned Pi/package/CLI versions and both dependency snapshots, then rerun offline and platform CI; do not simply claim the old pins are current.
2. Diagnose the intermittent Parallel wrapper parsing failure, add a regression test, then bring the portable launcher support into the active copy.
3. Consider loading this checkout as the single local package source, using Pi's documented package mechanism. First back up and move duplicate auto-discovered copies; never load both. Do not run bootstrap over the active profile while Pi is running.
4. Keep browser/desktop control opt-in; complete native GUI permission/interaction checks on each target platform before promising Windows/Linux/macOS functional parity.

Ultra consumes Pro 500 included allowance at **8× Standard**, then available credits at **6× Standard**. Select it explicitly; no default was changed. See [Fast/Ultra requirements and sources](extensions/chatgpt-fast/README.md) and [metric definitions](extensions/latency-throughput/README.md). HTTP/SSE is preserved; a persistent WebSocket transport remains a separate potential latency improvement, not part of this extension change.

## Public repository safety and ownership

See [THIRD_PARTY.md](THIRD_PARTY.md) for sources and licensing. Downloaded catalogs remain local; absence of an upstream license is not permission to redistribute them. This repo is not an npm publication and does not bundle host-provided Pi runtime packages.

No license grant for the original customization code has been selected (`UNLICENSED` in the manifest). Public visibility alone does not assign an open-source license.

# Pi setup

Portable, sanitized snapshot of a personal **Pi 1.1.0** setup for macOS, WSL/Linux, and native Windows.

This is executable extension code, not just preferences. Review it and the third-party sources before installing. The repository never includes credentials, OAuth state, sessions, generated model stores, personal absolute paths, compiled binaries, or node_modules.

## Included

- **chatgpt-fast**: per-session `/fast` preference for eligible official ChatGPT OAuth routes. It requests a service tier; it does not guarantee entitlement or performance.
- **latency-throughput**: native-footer integration showing TTFT and generation TPS p50/p95, plus the Fast toggle.
- **parallel**: public search, fetch/extract, and confirmed paid asynchronous research through Parallel CLI 0.9.3.
- **parallel-web** skill and customized skill routing/discovery instructions.
- Eight pinned third-party Pi packages and their captured npm dependency lockfile.
- Five third-party skill source revisions, snapshot checksums, and a downloader.
- Sanitized startup/model preferences and recap configuration.
- Bash/PowerShell bootstrap wrappers, a doctor command, offline tests, and a publication audit.

**Not included:** the macOS-only Codex Chrome/computer-use MCP bridges or their browser skill. No equivalent Windows browser/desktop backend is configured. `config/mcp.portable.json` intentionally has no servers.

## Prerequisites

- Node.js **22.19+**, with npm. Offline CI uses Node 24; the original host used Node 26.7.0.
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

Without `--install-pi`, Pi 1.1.0 must already be on PATH. Without `--with-skills`, only this package's own Parallel skill is added. Without `--with-parallel`, install the CLI separately.

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
```

Also exercise agent spawning, oracle, task persistence, ask-user dialogs, and preview export after authenticating. Offline tests verify the custom behavior without provider calls, account entitlement checks, or subscription quota. Optional Parallel `--live` tests make two public requests and may consume credits; they are never part of the default suite.

CI runs offline tests on Linux, macOS, and Windows. CI does not verify live providers, desktop integration, every terminal, or WSL specifically. See [validation notes](docs/VALIDATION.md).

## Reproducibility and updates

- Pi and the eight package versions are pinned in `versions.json`.
- `config/npm/package-lock.json` captures the original third-party dependency graph; npm selects platform-appropriate optional dependencies.
- The repository's root lockfile pins the development/test host.
- Skills are fetched at exact source commits and checked against the original customized snapshots.
- Global Pi's npm installation pins its top-level release but may resolve newer transitive dependencies than the development lockfile.
- The optional Python CLI installation pins its package version, not every Python transitive dependency.
- Account permissions, remote model catalogs, and service behavior are not frozen.

Do not run bulk package updates if you want to preserve the snapshot. Update deliberately, regenerate lockfiles, rerun tests on target platforms, and commit the reviewed changes.

## Public repository safety and ownership

See [THIRD_PARTY.md](THIRD_PARTY.md) for sources and licensing. Downloaded catalogs remain local; absence of an upstream license is not permission to redistribute them. This repo is not an npm publication and does not bundle host-provided Pi runtime packages.

No license grant for the original customization code has been selected (`UNLICENSED` in the manifest). Public visibility alone does not assign an open-source license.

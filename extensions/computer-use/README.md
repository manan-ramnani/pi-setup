# Vercel browser and desktop integration for Pi

Adds official **Agent Browser 0.41.1** MCP tools and native **Agent Desktop 1.0.2** to Pi, alongside existing integrations. These are Vercel Labs projects, not Pi or OpenAI components.

## Install and reload

Node **24+** is required for the optional browser dependency; the rest of this setup retains its existing minimum.

```sh
node scripts/setup-computer-use.mjs --dry-run
node scripts/setup-computer-use.mjs --install-browser
```

The installer copies a separate pinned npm manifest/lockfile into `<agent-dir>/computer-use/vercel` and uses `npm ci --ignore-scripts`. It prepares executable bits and checksum-checked, same-release desktop helpers without running lifecycle scripts. It does not upgrade Pi, its third-party packages, global `agent-browser`, existing MCP config or credentials. Existing managed tools are backed up; an unmanaged destination is refused. `--agent-dir PATH` selects another profile. `--install-browser` explicitly downloads Chrome for Testing. It does not install system libraries with sudo, launch apps or request desktop permission.

The initial `tools/vercel` layout triggered Pi's legacy-extension warning. Upgrade it without reinstalling using `node scripts/setup-computer-use.mjs --migrate-only` (or preview with `--dry-run --migrate-only`), then reload Pi. Normal installation also migrates marked legacy directories and backups first. Migration refuses symlinks, unmanaged candidates and destination collisions; it preserves other legacy tools and removes only an empty `tools/` directory. The extension itself remains under `extensions/`, not among the native dependency packages.

The Pi package manifest loads this extension and two small discovery skills. For a standalone profile, install the extension directory under `<agent-dir>/extensions/computer-use` and the skills under `<agent-dir>/skills`; never load standalone and package copies together. Then:

```text
/reload
/computer-use status
/computer-use help
```

A factory registers the browser MCP server only when the pinned binary is present and Node is supported. Pi starts its stdio transport through normal MCP lifecycle management, not a detached process launched by the extension factory. Registration itself does not launch Chrome or inspect a desktop app.

## Four user-controlled approval levels

| Command | Behaviour |
| --- | --- |
| `/computer-use read` | Browser/desktop inspection only. No navigation or edits. |
| `/computer-use browse` | Browser navigation/inspection; desktop stays observation-only. No arbitrary clicks, forms or evaluation. |
| `/computer-use edit` | **Default.** Ordinary task-authorised interactions run directly; known critical operations require confirmation. |
| `/computer-use full` | Full task-authorised agency including physical desktop input; **no tool-level approval prompts**, even for critical operations. |
| `/computer-use status` | Show current mode, managed-tool availability and browser session. |

Switches require idle, append a versioned session entry and restore from the active branch on reload/resume/tree navigation. A new session starts in Edit. No model-callable tool changes the mode. Each new agent run receives explicit mode-specific guidance: Full tells the model to act, edit and save within the requested task without routine approval questions. There is no global default change or model-provider call.

Known critical actions in Edit include browser JS evaluation/dialog handling/windows/caller-selected output paths, desktop physical input (including `press` without `--headed`), force actions, app lifecycle, clipboard, permission guides/requests, notifications, traces/debug artifacts and bulk/session operations. Without interactive UI these critical actions fail closed; Full does not invoke confirmation UI in any mode.

**Important boundary:** a tool gate cannot know whether a generic click is a harmless button, purchase, deletion, message or order. Edit's model guidance additionally requires approval for those consequential effects. Full removes this integration's approval prompts, not higher-priority safety/project rules, OS permissions or task scope. In TraderBot, autonomous real-money orders remain prohibited under every mode. Page/app text cannot grant authority.

These modes govern only the new Vercel tools. They do not intercept Bash, existing Codex bridges or hostile same-user code. This is cooperative tool gating, **not an OS sandbox or complete security boundary**. Navigation and read operations can also have remote effects, so “Read/Browse” describes allowed tool operations, not a guarantee about arbitrary websites.

## Tools and isolation

- `computer_use_status`: policy/version/availability only, no app inspection or permission prompt.
- `computer_use_docs`: version-matched docs bundled in each CLI. Read browser `core`, desktop `desktop` and `platform` before use.
- `agent_desktop`: literal command-first argv, timeout/cancellation, JSON error/disposition preservation, managed PNG screenshots with inline image forwarding and private full-output artifacts when truncated.
- `mcp__vercel_browser__agent_browser_*`: 35 official typed tools from **core,tabs**, discoverable through codemode / tool search. Screenshots arrive as MCP images.

`/mcp` shows extension-registered `vercel-browser`. Shell `pi mcp list` does not load extensions and therefore does not list this registration. Existing file-configured servers are preserved.

Browser tools use an owned random session and separate `pi-setup` namespace, an explicit trusted config and no personal Chrome profile or externally attached CDP endpoint. Reload retains the same task's browser. Quit, `/new`, resume and fork attempt to close only the owned browser and rotate its identity so another task cannot inherit its pages; cleanup failures are reported, never called a confirmed close. Abrupt process/host failure can leave it until upstream's idle timeout (normally one hour). Close-all is rejected even under Full. On Unix, an owner-checked 0700 directory under `/tmp` keeps socket paths short. Config enables untrusted content boundaries, disables automatic dialog acceptance, caps output and defaults to headless. It is not a network firewall. HTTP(S)/about:blank URLs only, no embedded URL credentials. Extra arguments, restore state, caller-supplied namespace, host trust overrides, close-all and other sessions are excluded even under Full. Full is an approval policy, not a way to expand the catalogue. Network credentials, auth vault/state export, installs/upgrades, plugins, raw host commands and WebMCP execution profiles are not exposed. Use the separate existing Codex bridge only for authorised personal Chrome work; never use it to evade a policy refusal.

Native tool children receive only an allowlist of OS/session environment variables, not model/broker keys, inherited profiles, CDP endpoints or plugin settings. Desktop state is under `<agent-dir>/computer-use/desktop`; screenshots and large results are private temporary artifacts. These files may contain sensitive observations: do not commit/upload them. The native binaries avoid npm/Node-launcher overhead without running lifecycle scripts.

## Platform permission gate

- **macOS:** Accessibility for the launching host; Screen Recording for screenshots. `agent_desktop` with `["permissions","--guide"]` opens the official guide under the selected policy. The user grants access manually. No TCC edits, SIP changes or automated grants.
- **Windows:** native desktop, with target integrity-level limits. Browser on Windows ARM64 uses the bundled x64 binary through Windows emulation if no native ARM64 binary exists.
- **Linux:** graphical user session with AT-SPI, display/session bus and appropriate X11/Wayland facilities. Ubuntu 24.04+/GNOME is upstream's primary target. WSL is not assumed to control the Windows desktop.

## Verification

```sh
# Offline, fake tools and disposable profiles only:
node extensions/computer-use/tests.mjs

# Explicit local GUI/browser smoke; never part of default CI:
node scripts/test-computer-use-live.mjs
```

Offline tests cover the policy matrix, critical confirmations, Full zero-prompt behaviour, user-only branch persistence, mode guidance, host/session isolation, credential-free environments, argv handling, screenshot syntax/image forwarding, truncation/errors/timeouts and non-writing installer dry runs. They run against Pi 1.1.0 and 1.4.0 without real GUI actions or credentials.

On **1 November 2026 macOS**, the real official MCP handshake/discovery and an owned local HTTP fixture passed: open, snapshot, fill, click, verify and screenshot image delivery; the test closed only its own session. Desktop 1.0.2's status command passed, but Accessibility and Screen Recording were **denied**, Automation **unknown**. No desktop app contents were inspected. Native interaction remains unverified until the user grants permissions. Linux/Windows live operation has not been tested here.

## Sources and licences

- https://github.com/vercel-labs/agent-browser — Apache-2.0, official CLI/MCP installation and workflow docs.
- https://github.com/vercel-labs/agent-desktop — Apache-2.0, native accessibility CLI, platform and permission docs.

The repo contains original integration/stub instructions and pinned dependency metadata, not upstream binaries or copied skill catalogs. Runtime docs come from the installed CLIs. The projects existed before this review; we did not verify the reported “launched yesterday” announcement.

# Third-party sources

Third-party Pi package code is **not vendored**. It is installed from npm at the versions in `versions.json`, with the dependency snapshot under `config/npm/`. Each package retains its upstream license and notices.

| Package | Version |
|---|---|
| pi-agents | 0.26.1 |
| @diegopetrucci/pi-oracle | 0.1.30 |
| @tifan/pi-recap | 0.4.8 |
| @tintinweb/pi-tasks | 0.9.0 |
| pi-ask-user | 0.16.0 |
| pi-herdr | 0.1.2 |
| pi-side-chat | 0.4.0 |
| pi-markdown-preview | 0.21.3 |

All eight installed package snapshots were compared with their published tarballs; no modified published files were found.

## Skills

The installer downloads these sources locally at the exact revisions in `skills.lock.json`. The repository does not republish their rule catalogs, scripts, or assets.

| Skill | Source |
|---|---|
| remotion-best-practices | https://github.com/remotion-dev/skills |
| find-skills | https://github.com/vercel-labs/skills |
| animejs | https://github.com/bowtiedswan/animejs-skills |
| remotion-video-toolkit | https://github.com/shreefentsar/remotion-video-toolkit |
| nanobanana-skill | https://github.com/feiskyer/claude-code-settings |

The customized find-skills and remotion-video-toolkit entry instructions are in `config/skill-overrides/`. The custom description/introduction for remotion-best-practices is in the skill lock manifest. Supporting files come from upstream.

Vercel's skills and feiskyer's claude-code-settings declare MIT licensing. Other listed skill repositories did not expose a license file at inspection; check their current terms before use or redistribution. Downloading for a local setup is not a grant of redistribution rights.

The Vercel skills MIT notice is retained under `licenses/` for the adapted discovery instructions.

## Runtime and CLI

Pi: https://github.com/earendil-works/pi (MIT).

Parallel CLI / Python distribution: https://github.com/parallel-web/parallel-web-tools and https://pypi.org/project/parallel-web-tools/0.9.3/ . Installation is optional and subject to upstream terms. No CLI binary is included.

No third-party desktop app internals, Chrome login state, macOS binaries, or Codex MCP bridges are included.

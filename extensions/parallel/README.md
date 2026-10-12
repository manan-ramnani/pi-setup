# Parallel CLI extension

Loaded by this repository's Pi package manifest. Requires Parallel CLI **0.9.3** installed and authenticated separately.

Commands: `/parallel status`, `/parallel processors`, `/parallel help`.

Six native tools, also callable through codemode:

- `parallel_search`: public source discovery.
- `parallel_fetch`: fuller page Markdown by default.
- `parallel_extract`: focused excerpts by default.
- `parallel_research_start`: paid async submission after explicit interactive confirmation; `dry_run` makes no API call.
- `parallel_research_status`: inspect an existing run.
- `parallel_research_result`: retrieve an existing report with bounded waiting and unique temporary output paths.

## Executable discovery

Set `PI_PARALLEL_CLI` to override the executable. Otherwise the extension checks `~/.local/bin/parallel-cli` (`parallel-cli.exe` on Windows), then PATH. Python/uv installs provide a native executable launcher on Windows.

Optional `PI_PARALLEL_CLI_ARGS` is a JSON array of prefix arguments; useful when invoking a script through Node/Python. All arguments are passed directly, without shell interpolation. For example:

```text
PI_PARALLEL_CLI=/path/to/python
PI_PARALLEL_CLI_ARGS=["-m","your_cli_module"]
```

Do not use a shell command string as the executable. Prefix arguments are user-controlled configuration, not model tool parameters.

## Safety and behavior

- Uses the CLI's own authentication; does not read/copy credential files.
- No startup network calls or background processes.
- Search/extraction can consume credits; queries/URLs are sent to Parallel.
- Search/fetch/extract attach Pi session/model identifiers for CLI request grouping/telemetry, not transcripts/files.
- Remote content is untrusted; never submit private data or signed URLs without authorization.
- Remote fetch does not share browser cookies and cannot access local files or localhost. Basic private-host filtering is not complete DNS/IP isolation.
- Paid submissions require approval of the question, guidance, context and processor; submissions without a confirmation UI are refused.
- Cancellation stops local waiting, not an already-created remote job. Never blindly retry an ambiguous submission or submit again to poll.
- Structured results are `{result, artifact_path, truncated}`; full successful JSON is saved in a private temporary directory. Model-facing output is capped at 24 KB/1000 lines.
- Result polling defaults to 60 seconds and is capped at 300 seconds. It does not overwrite project files.
- Errors, invalid JSON, cancellation and timeouts remain visible.
- No unrestricted CLI, account management, balance top-up, or memory management tool.

## Validate

```sh
node extensions/parallel/tests.mjs
# Optional real public requests (can consume credits):
node extensions/parallel/tests.mjs --live
```

Default tests load the actual extension and launch a fake CLI through Node with argument arrays, including on native Windows. No credentials, real queries, provider calls, or paid jobs are used.

Read `skills/parallel-web/SKILL.md` for usage. Disable the resource through `pi config`.

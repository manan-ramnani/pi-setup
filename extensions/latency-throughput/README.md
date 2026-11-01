# Client-observed latency and output throughput for Pi

Observational collector with native-footer integration. It changes no requests, prompts, headers, credentials, models or thinking levels, and makes no network calls.

## Use

After `/reload`, the footer adds this illustrative suffix:

```text
1.2s / 3.5s | 27 / 55 E2E TPS | Ultra requested
```

Both pairs are **p50 / p95** over the last **50 successful measured foreground calls per provider/API/model** in the active session branch. With one sample, each pair is equal. Before measurements exist, values are `—`. Values refresh on completion, not continuously during streaming.

The extension reuses Pi's exported native `FooterComponent`, preserving input/output and cache token totals, cache-hit rate, cumulative estimated cost/subscription marker, context usage, auto-compaction indication, cwd/git/session name, right-aligned model/thinking and virtual routes. Other extension statuses remain. When there is insufficient padding, telemetry gets a separate row rather than displacing native metrics or the model. ANSI/Unicode-aware width helpers handle narrow terminals.

| Command | Purpose |
| --- | --- |
| `/latency` or `/latency status` | Show percentile pairs, provider/model and sample counts. |
| `/latency reset` | Clear all model buckets in this branch while idle. |
| `/latency off` | Restore native footer; continue collecting samples. |
| `/latency on` | Show this footer again. |
| `/latency help` | Explain definitions and limitations. |

Samples and visibility survive reload/resume and follow the active branch. New sessions start empty with telemetry enabled. Buckets do not distinguish service tier, thinking level or context size: use `/latency reset` between controlled comparisons. Historical uninstrumented responses cannot be timed retroactively.

## TTFT: first observed content

```text
TTFT_ms = first_observed_content_time - request_payload_hook_time
```

Times use monotonic `performance.now()`. First content is the first nonempty normalized text/thinking delta, tool argument delta or streamed tool name. Headers, empty starts, signatures, heartbeats and usage-only events do not qualify.

This is **client-observed time to first content**, not a server-side first-generated-token timestamp. Hidden reasoning, retries/backoff, network buffering and client/event processing affect it. Router/classifier preparation before the payload hook is outside this interval. Tool execution after a response is excluded. One sample is collected per provider call, including calls following tool results, not per complete user task.

Failed/aborted/no-content calls are omitted. Idle/background calls are not armed. With ambiguous multiple pre-start request hooks (for example overlapping cache warming), the sample is omitted rather than reporting a falsely shortened TTFT. Transport-internal retries normally reuse one hook, so their waiting remains included.

## E2E TPS: full-request output rate

```text
request_ms = TTFT_ms + post_first_content_ms
E2E_output_tokens_per_second = reported_output_tokens / (request_ms / 1000)
```

- Uses final provider output usage, never character counts or SSE chunk counts. Output usage can include hidden reasoning.
- Includes the initial wait, because some reported output tokens may have been generated as hidden reasoning before visible content. It is **not GPU decode speed**, visible-text tokens/sec or whole-agent task throughput.
- Calculates a rate per retained call, then nearest-rank p50 and p95 of those rates. It is not a token-weighted aggregate.
- Uses the same last-50-call window as TTFT; missing/zero output usage or nonpositive/nonfinite full intervals are excluded from TPS only. Status reports valid counts.
- A single visible content burst with positive TTFT and zero post-first-content duration still has a valid E2E rate.
- Rates are rounded to whole numbers; TTFT is shown in seconds to one decimal place. TPS p95 is the **high** end of throughput, not a worst-case speed metric.

Example: 120 reported output tokens, 9 seconds to first content and 1 more second to completion = **12 E2E TPS**, not the previous apparent streaming figure of 120 TPS.

### Change from the original streaming rate

The original formula divided total output usage only by first-content-to-completion time. That arithmetic matched its definition but could exaggerate speed for hidden reasoning. From 1 November 2026 the footer explicitly says **E2E TPS** and includes TTFT, as requested. Persisted version-1 samples already contain both durations, so they are recomputed with the new formula on reload; no history is rewritten and no migration/reset is required. TTFT itself is unchanged.

Nearest-rank percentile: sort values ascending and select rank `ceil(p × n)`, using 1-based indexing. p50/p95 are per-call distribution summaries, not the latest request's values.

## Inline speed preference

`Ultra requested`, `Fast on` and their `(inactive)` forms describe `/fast`'s preference, not proof of delivered service. `Fast off` means no Fast/Ultra preference is active. `/fast status` reports requested and server-reported tier details. Only the `chatgpt-fast` status is moved inline; its source map is not mutated.

## Persistence and safety

Only provider/API/model IDs, numeric timings/output counts and receipt timestamps are stored as versioned custom session entries, excluded from model context. Wall-clock time is metadata; it does not determine durations. History is capped at 50 samples per bucket. Reset appends a branch-aware marker rather than rewriting history.

Persistence uses `turn_end`, preserving other extensions' pending entries/continuation choices. The virtual-model display uses the latest successful physical response and its dispatched thinking level; errors do not overwrite it. Only TUI mode installs the custom footer; RPC/print collection avoids terminal UI. Pi allows one custom footer at a time; `/latency on` reinstalls this one if another extension replaced it.

## Validate

```sh
node extensions/latency-throughput/tests.mjs
node extensions/chatgpt-fast/tests.mjs
```

Deterministic offline tests cover TTFT and E2E rate/percentile maths, hidden-reasoning wait, single-burst/zero/overflow cases, rolling windows, error/abort/content filtering, model separation, branch/reload/reset, native accounting/layout, ANSI/narrow widths, virtual routes, boundary composition, Fast/Ultra preferences and isolated discovery. Tested on pinned Pi 1.1.0 and installed Pi 1.4.0. No real inference, credentials or subscription quota are used.

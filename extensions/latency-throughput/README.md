# Latency and throughput footer

Loaded by this repository's Pi package manifest. Observational timing collector, enabled by default in new sessions; integrates the existing `/fast` toggle.

Example (illustrative, not a live measurement):

```text
↑703k ↓98k R21M CH99.1% $3.621 (sub) 10.4%/272k (auto) | 1.2s / 3.5s | 70 / 120 TPS | Fast on
```

Both pairs are **p50 / p95**. Before valid measurements, placeholders appear. Historical responses cannot be timed retroactively.

The extension reuses Pi's exported native FooterComponent rather than copying accounting logic. Token/cache usage, costs/subscription markers, context/compaction, cwd/git/session name, virtual routed-model display and other statuses remain. The inline Fast toggle is not a receipt of the actual service tier; use `/fast status`.

If there is insufficient padding, telemetry gets its own row instead of removing native metrics or the model label. ANSI/Unicode-aware helpers handle narrow layouts.

## Commands

| Command | Purpose |
|---|---|
| `/latency status` | Percentiles, identity and valid sample counts |
| `/latency reset` | Clear all model samples in this branch; requires idle |
| `/latency off` | Restore the native footer; keep collecting |
| `/latency on` | Show telemetry |
| `/latency help` | Definitions and limitations |

Samples and visibility survive reload/resume and follow the active session branch. New sessions have empty buckets. Samples are not separated by thinking level or service tier; reset when comparing those settings.

## Definitions

**TTFT:** monotonic time from Pi's before_provider_request hook to the first nonempty normalized text/thinking/tool content. Headers, heartbeats, empty starts and usage-only events do not count. One sample per successful foreground provider call, including calls after tool results—not one per user turn.

**TPS:** authoritative finalized output tokens divided by seconds from first content to completion. This excludes TTFT and subsequent tool execution. It is not a character/SSE estimate or instantaneous rate.

Each displayed percentile uses nearest-rank statistics over the last 50 successful measured calls per provider/API/model in the branch. Missing/zero output usage, nonpositive intervals or nonfinite rates exclude TPS but not necessarily TTFT.

Failed/aborted/no-content calls and unarmed background calls are omitted. Multiple request hooks before stream start make identity/timing ambiguous, so the sample is omitted. Retry waiting after the hook generally remains included.

These are client-observed metrics, not server instrumentation or pure GPU decode speed. Hidden reasoning can increase TTFT and output usage can include hidden reasoning, inflating apparent TPS. Network buffering and local event processing affect measurements; routing/classification before the hook is excluded.

Virtual selections use the latest successful physical response identity/thinking, matching Pi's native routed-model behavior.

## Persistence and compatibility

Stores only IDs, numeric timing/output usage and sample timestamps in custom session entries excluded from model context. Persists at turn_end while preserving other extensions' entries and continuation choices. No network calls, credentials, request changes, timers or analytics uploads.

The custom footer is TUI-only; collection supports other modes. Pi has one custom footer slot: another footer can replace it; `/latency on` reinstalls this footer.

Tested against Pi **1.1.0**; keep the version pinned and rerun tests after core renderer updates.

```sh
node extensions/latency-throughput/tests.mjs
```

Tests cover telemetry math, exclusions, rolling windows, branch restoration/reset, boundary composition, native layout/accounting, virtual models, cleanup and headless behavior. Auto-discovery uses an isolated temporary agent directory, not a personal installation. No inference or credentials are used.

Disable through `pi config`, then `/reload`.

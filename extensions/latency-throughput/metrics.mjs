// Pure timing/statistics. No prompt content, credentials, HTTP, or token estimates.
export const WINDOW = 50;
export const ENTRY = 'latency-throughput';
export const keyFor = ({ provider, api, model }) => JSON.stringify([provider, api, model]);

export function validSample(s) {
  return !!s && typeof s === 'object' &&
    ['provider', 'api', 'model'].every(k => typeof s[k] === 'string' && s[k].length > 0 && s[k].length <= 1024) &&
    ['ttftMs', 'generationMs', 'outputTokens', 'at'].every(k => Number.isFinite(s[k]) && s[k] >= 0);
}

export function percentile(values, fraction) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

export function summarize(samples) {
  // End-to-end output rate: include TTFT because output usage can include
  // hidden reasoning generated before the first observable content. This is
  // client-observed throughput, not decode speed or token-weighted throughput.
  const rates = samples.map(s => {
    const durationMs = s.ttftMs + s.generationMs;
    return s.outputTokens > 0 && durationMs > 0 && Number.isFinite(durationMs)
      ? s.outputTokens / (durationMs / 1000) : undefined;
  }).filter(rate => rate !== undefined && Number.isFinite(rate));
  return {
    count: samples.length,
    p50: percentile(samples.map(s => s.ttftMs), 0.5),
    p95: percentile(samples.map(s => s.ttftMs), 0.95),
    tpsCount: rates.length,
    tpsP50: percentile(rates, 0.5),
    tpsP95: percentile(rates, 0.95),
  };
}
export function formatMetrics(stats) {
  const seconds = ms => ms === undefined ? '—' : `${(ms/1000).toFixed(1)}s`;
  const speed = rate => rate === undefined || !Number.isFinite(rate) ? '—' : Math.round(rate).toString();
  return `${seconds(stats.p50)} / ${seconds(stats.p95)} | ${speed(stats.tpsP50)} / ${speed(stats.tpsP95)} E2E TPS`;
}

export function isContentEvent(event) {
  if (['text_delta', 'thinking_delta', 'toolcall_delta'].includes(event.type) &&
      typeof event.delta === 'string' && event.delta.length > 0) return true;
  // A name may arrive at start, or later in a name-only delta with delta="".
  if (event.type === 'toolcall_start' || event.type === 'toolcall_delta') {
    const block = event.partial?.content?.[event.contentIndex];
    return block?.type === 'toolCall' && typeof block.name === 'string' && block.name.length > 0;
  }
  return false; // Headers, empty starts, signatures, usage and heartbeats aren't tokens.
}

export class Telemetry {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.history = new Map();
    this.active = undefined;
    this.armed = false;
    this.open = false;
  }
  restore(entries) {
    this.history.clear(); this.cancel();
    for (const entry of entries) {
      if (entry.type !== 'custom' || entry.customType !== ENTRY || entry.data?.version !== 1) continue;
      if (entry.data.kind === 'reset') this.history.clear();
      else if (entry.data.kind === 'sample' && validSample(entry.data.sample)) this.add(entry.data.sample);
    }
  }
  arm() { this.cancel(); this.armed = true; }
  begin() {
    if (!this.armed || this.open) return;
    // The hook has no request ID/origin. A second pre-start hook could be
    // background cache warming rather than the foreground call. Never let
    // it shorten TTFT: omit the ambiguous sample. Internal transport retries
    // normally reuse one payload hook, so their waiting time stays included.
    if (this.active) { this.active.ambiguous = true; return; }
    this.active = { start: this.now(), first: undefined, identity: undefined, ambiguous: false };
  }
  started(message) {
    if (!this.active || !this.armed || message.role !== 'assistant') return;
    this.open = true;
    this.active.identity = { provider: message.provider, api: message.api, model: message.model };
  }
  update(message, event) {
    if (!this.open || !this.active?.identity || message.role !== 'assistant') return;
    if (keyFor(this.active.identity) !== keyFor(message)) return;
    if (this.active.first === undefined && isContentEvent(event)) this.active.first = this.now();
  }
  finish(message, at = Date.now()) {
    if (message.role !== 'assistant') return;
    const request = this.active;
    const end = this.now();
    this.cancel();
    if (!request?.identity || request.ambiguous || request.first === undefined ||
        keyFor(request.identity) !== keyFor(message) ||
        !['stop', 'length', 'toolUse', 'deferred'].includes(message.stopReason)) return;
    const sample = {
      ...request.identity,
      ttftMs: request.first - request.start,
      generationMs: end - request.first,
      outputTokens: message.usage?.output ?? 0,
      at,
    };
    if (!validSample(sample)) return;
    this.add(sample);
    return sample;
  }
  add(sample) {
    const key = keyFor(sample);
    const samples = this.history.get(key) || [];
    samples.push({ ...sample });
    if (samples.length > WINDOW) samples.splice(0, samples.length - WINDOW);
    this.history.set(key, samples);
  }
  stats(identity) { return summarize(identity ? this.history.get(keyFor(identity)) || [] : []); }
  cancel() { this.armed = false; this.open = false; this.active = undefined; }
}

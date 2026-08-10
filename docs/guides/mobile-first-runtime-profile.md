# Mobile-first runtime profile

This guide focuses on constrained and mobile-heavy deployments where you want
predictable latency, lower retry pressure, and better resilience under variable
network conditions.

## 1) Enable the mobile-conservative profile

`enableMobileConservativeProfile` applies safer defaults for constrained
environments:

- shorter request timeouts
- adaptive polling bounds for Device and CIBA grants
- conservative proactive refresh defaults with jitter support

```ts
let config!: client.Configuration

client.enableMobileConservativeProfile(config)
```

You can override individual defaults:

```ts
client.enableMobileConservativeProfile(config, {
  timeoutSeconds: 12,
  refreshThresholdSeconds: 25,
  refreshJitterSeconds: 6,
  pollMinIntervalSeconds: 2,
  pollMaxIntervalSeconds: 45,
  pollBackoffMultiplier: 1.6,
  pollJitterRatio: 0.1,
})
```

## 2) Use adaptive polling for Device and CIBA grants

Both polling grants support adaptive interval controls:

- `adaptivePolling`
- `minIntervalSeconds`
- `maxIntervalSeconds`
- `backoffMultiplier`
- `jitterRatio`
- `onRetry`

This helps reduce synchronized bursts while still converging on completion.

## 3) Use token auto-refresh with burst smoothing

`fetchProtectedResourceWithAutoRefresh` now supports:

- `refreshThresholdSeconds` (proactive refresh window)
- `refreshJitterSeconds` (randomized threshold offset)
- `onRefresh` and `onChallenge` callbacks

This helps avoid mass simultaneous refreshes in multi-client mobile fleets.

## 4) Capture diagnostics

Use `createMobileDiagnosticsCollector()` as a lightweight diagnostics surface:

```ts
let diagnostics = client.createMobileDiagnosticsCollector()

client.enableTelemetry(config, diagnostics)

// Optional: wire grant/refresh events
let options = {
  onRetry: diagnostics.recordPollRetry,
  onRefresh: diagnostics.recordRefresh,
  onChallenge: diagnostics.recordChallenge,
}
```

Then inspect runtime metrics:

```ts
let snapshot = diagnostics.snapshot()
```

Snapshot includes request/response totals, request latency aggregates, poll
retry reason counts, refresh outcomes, and challenge classifications.

## Migration notes

For existing server-centric setups:

1. Keep existing code paths and first enable `createMobileDiagnosticsCollector`.
2. Enable `enableMobileConservativeProfile` in staging and compare observed
   grant latency, retries, and refresh outcomes.
3. Tune polling and refresh knobs by deployment class (mobile vs. non-mobile).
4. Roll out with explicit KPI checks (latency, retry pressure, refresh success
   rate).

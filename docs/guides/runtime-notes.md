# Runtime integration notes

`openid-client` targets JavaScript runtimes that provide WebCrypto and Fetch
API primitives. The core integration pattern is the same across runtimes, but a
few deployment details matter.

## Node.js

- Use the built-in `fetch`, `URL`, `Headers`, `crypto.subtle`, and
  `AbortSignal.timeout` support from supported Node.js releases.
- Reuse `Configuration` instances and the underlying transport wiring whenever
  your process model allows it so discovery results, connection pooling, and
  other cached state stay hot.
- Set `config.timeout` or `config[client.customFetch]` when you need custom
  transport behavior.
- The [Passport Strategy](../../examples/passport.ts) is a good starting point
  for session-based web apps.

## Measure before tuning

Authentication traffic is usually network-bound, so measure discovery, token,
JWKS, and protected-resource latency separately before changing configuration.
Record status codes, timeout and abort errors, retry counts, and response sizes,
but never log authorization codes, tokens, cookies, client secrets, or private
key material.

For long-lived processes, keep one `Configuration` per authorization-server
and client combination rather than rediscovering it for every request. Reuse the
same `customFetch` transport as well; this lets the runtime retain connection
pools and any application-level observability without changing protocol
behavior.

Set a timeout that fits the operation's latency budget. A long timeout can
consume resources during an outage, while a short timeout can interrupt slow
authorization servers. Treat timeout changes as an operational setting and
measure them under normal and degraded network conditions.

## Browsers

- Store PKCE verifiers, state, and nonce values per user session.
- Persist DPoP key material in browser storage that can retain WebCrypto keys,
  such as IndexedDB.
- Redirect handling is framework-specific; use `authorizationCodeGrant` once you
  reconstruct the current callback URL.

## Deno, Workers, and edge runtimes

- Prefer `client.getJwksCache` and `client.setJwksCache` if your deployment does
  not retain memory between invocations.
- Keep request handlers small and reconstruct `Configuration` from discovery or
  preloaded metadata on each invocation.
- If discovery is too expensive for the hot path, preload server metadata and
  restore JWKS cache data from your own storage between invocations.
- Inject runtime-specific networking through `config[client.customFetch]` when
  platform defaults need to be wrapped.
- Do not assume in-memory state survives between invocations. Persist only the
  exported JWKS cache data and other non-secret metadata needed to avoid cold
  lookups; keep tokens and private keys in protected storage.

## Retry boundaries

Retries should be supplied by the transport or application with an explicit
policy. Do not blindly retry every POST: repeating authorization, token, or
registration requests can create duplicate operations or amplify an outage.
Honor `Retry-After` for device authorization and CIBA polling, and cap retries
with a deadline so a request cannot outlive its caller.

## Bun and Electron

- Treat them similarly to browser or Node.js integrations depending on where the
  code executes.
- Keep private keys and token state in the most constrained environment
  available, especially when using DPoP or private key JWT.
- Reuse the same examples and guides from this repository; the APIs stay the
  same across supported runtimes.

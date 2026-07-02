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

## Bun and Electron

- Treat them similarly to browser or Node.js integrations depending on where the
  code executes.
- Keep private keys and token state in the most constrained environment
  available, especially when using DPoP or private key JWT.
- Reuse the same examples and guides from this repository; the APIs stay the
  same across supported runtimes.

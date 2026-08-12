# Token lifecycle and protected resource access

This guide focuses on obtaining tokens, using them against APIs, refreshing
them, and applying token management endpoints when needed.

## Call a protected resource

Use an access token returned by any supported grant and send it with
`fetchProtectedResource`.

```ts
let config!: client.Configuration
let access_token!: string

let response = await client.fetchProtectedResource(
  config,
  access_token,
  new URL('https://rs.example.com/api'),
  'GET',
)
```

## Fetch UserInfo after OpenID Connect sign-in

When you authenticated an end-user with OpenID Connect, pass the expected
subject from the ID Token claims.

```ts
let config!: client.Configuration
let access_token!: string
let sub!: string

let userInfo = await client.fetchUserInfo(config, access_token, sub)
```

## Refresh an access token

```ts
let config!: client.Configuration
let refresh_token!: string

let refreshedTokens = await client.refreshTokenGrant(config, refresh_token)
```

Authorization servers may rotate refresh tokens. Replace the stored token set
with the complete successful response, including a new `refresh_token` when one
is returned, and protect the update from concurrent requests for the same
session. If the response does not contain a new refresh token, retain the
existing one only when the server's contract permits it.

```ts
let refreshedTokens = await client.refreshTokenGrant(config, refresh_token)

await saveTokenSet({
  ...refreshedTokens,
  refresh_token: refreshedTokens.refresh_token ?? refresh_token,
})
```

Keep access-token refresh close to its expiry rather than refreshing on every
protected-resource request. A small application-defined safety window accounts
for clock skew and network latency without adding unnecessary token-endpoint
traffic.

## Automatic token refresh around protected resource calls

`fetchProtectedResourceWithAutoRefresh` wraps `fetchProtectedResource` with
two layers of refresh logic so you do not need to write refresh-before-call
boilerplate:

1. **Proactive refresh** — if the stored access token expires within
   `refreshThresholdSeconds` (default: 30), the token is refreshed *before*
   the request is sent.
2. **Reactive refresh** — if the resource server responds with a ****** DPoP
   `WWW-Authenticate` challenge that indicates the token is invalid or expired
   (e.g. `error="invalid_token"`), the token is refreshed and the request is
   retried once. Challenges with `error="insufficient_scope"` or
   `error="invalid_request"` are re-thrown as `WWWAuthenticateChallengeError`
   because a refresh will not help.

Concurrent calls that share the same `Configuration` and refresh token
are deduplicated: only one token-endpoint request is issued and all callers
receive the same result.

```ts
let config!: client.Configuration
let tokens!: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers

let { response, tokens: updatedTokens, refreshError } =
  await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api'),
    'GET',
  )

// Always persist the returned tokens — they may have been refreshed.
await saveTokenSet(updatedTokens)

// A refresh error is exposed without masking the original resource response
// so you can decide how to handle the failure.
if (refreshError) {
  console.warn('Token refresh failed; using stale tokens', refreshError)
}
```

Per [RFC 6749 §6](https://www.rfc-editor.org/rfc/rfc6749#section-6), if the
authorization server does not return a new refresh token, the existing one is
retained automatically.

### Non-idempotent methods and stream bodies

By default only idempotent methods (GET, HEAD, OPTIONS, TRACE) are retried
after a reactive refresh. POST and other non-idempotent methods are not
retried unless you explicitly opt in:

```ts
let { response, tokens: updatedTokens } =
  await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/action'),
    'POST',
    JSON.stringify({ action: 'do' }),
    { 'content-type': 'application/json' },
    { retryNonIdempotentRequests: true },
  )
```

`ReadableStream` bodies can never be replayed and are never retried regardless
of the method or option value.

### Tuning the proactive refresh window

```ts
let { response, tokens: updatedTokens } =
  await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api'),
    'GET',
    undefined,
    undefined,
    { refreshThresholdSeconds: 60 },
  )
```

`refreshThresholdSeconds` must be a finite, non-negative number, or a
`TypeError` is thrown at call time.



Use the token management endpoints when the authorization server exposes them.

```ts
let config!: client.Configuration
let refresh_token!: string
let access_token!: string

let introspection = await client.tokenIntrospection(
  config,
  access_token,
  {
    token_type_hint: 'access_token',
  },
)

await client.tokenRevocation(config, refresh_token, {
  token_type_hint: 'refresh_token',
})
```

## Request efficiency and retries

Reuse a `Configuration` instance and its JWKS cache where the runtime permits
it. Configure `config.timeout` to match the caller's deadline, and use
`config[client.customFetch]` for connection pooling, tracing, or a carefully
bounded retry policy.

Do not retry a failed token or revocation request indiscriminately. Prefer
retrying transient transport failures only when the operation and authorization
server semantics make repetition safe. Device authorization and CIBA polling
already have protocol-specific retry behavior; allow their `Retry-After`
responses to determine the next poll time.

## Device and backchannel flows

When the end-user is not redirected in the same browser session, use polling
grants instead.

```ts
let config!: client.Configuration
let scope!: string
let login_hint!: string

let deviceAuthorizationResponse = await client.initiateDeviceAuthorization(
  config,
  { scope },
)
let deviceTokens = await client.pollDeviceAuthorizationGrant(
  config,
  deviceAuthorizationResponse,
)

let cibaResponse = await client.initiateBackchannelAuthentication(config, {
  scope,
  login_hint,
})
let cibaTokens = await client.pollBackchannelAuthenticationGrant(
  config,
  cibaResponse,
)
```

## Related examples

- [Client Credentials Grant](../../examples/client-credentials.ts)
- [Device Authorization Grant](../../examples/device.ts)
- [Client-Initiated Backchannel Authentication (CIBA)](../../examples/ciba.ts)
- [Token management](../../examples/token-management.ts)

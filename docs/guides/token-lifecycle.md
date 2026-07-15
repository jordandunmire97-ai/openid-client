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

## Introspect and revoke tokens

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

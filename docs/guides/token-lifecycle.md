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

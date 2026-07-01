# Web app login and logout

This guide shows a practical browser-based login flow that keeps request state
in the user session and finishes with RP-initiated logout.

## Discover the authorization server

```ts
let server!: URL
let clientId!: string
let clientSecret!: string

let config = await client.discovery(server, clientId, clientSecret)
```

## Start the authorization request

Generate fresh PKCE values per redirect and store the verifier plus state or
nonce in the end-user session.

```ts
let config!: client.Configuration
let redirect_uri!: string
let scope!: string

let code_verifier = client.randomPKCECodeVerifier()
let code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
let state = client.randomState()

let redirectTo = client.buildAuthorizationUrl(config, {
  redirect_uri,
  scope,
  code_challenge,
  code_challenge_method: 'S256',
  state,
})
```

## Complete the callback

On the redirect back to your application, recover the stored verifier and state
from the session and validate the callback before using the returned tokens.

```ts
let config!: client.Configuration
let code_verifier!: string
let state!: string
let getCurrentUrl!: () => URL

let tokens = await client.authorizationCodeGrant(config, getCurrentUrl(), {
  pkceCodeVerifier: code_verifier,
  expectedState: state,
})
```

If the request was for OpenID Connect, you can inspect the ID Token claims and
use the access token for a UserInfo or protected resource call.

```ts
let tokens!: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers

let claims = tokens.claims()
let id_token = tokens.id_token
```

## Trigger RP-initiated logout

When you have an `id_token` from a prior sign-in, you can construct a logout
URL for the authorization server's end-session endpoint.

```ts
let config!: client.Configuration
let id_token!: string
let post_logout_redirect_uri!: string

let logoutUrl = client.buildEndSessionUrl(config, {
  post_logout_redirect_uri,
  id_token_hint: id_token,
})
```

## Related examples

- [Authorization Code Flow (OAuth 2.0)](../../examples/oauth.ts)
- [Authorization Code Flow (OpenID Connect)](../../examples/oidc.ts)
- [Logout](../../examples/logout.ts)
- [Passport Strategy](../../examples/passport.ts)

# Security best practices

This guide summarizes the security-relevant configuration choices when using
`openid-client` in production applications.

## Always use PKCE

PKCE (Proof Key for Code Exchange) protects against authorization code
interception attacks. Always generate a fresh `code_verifier` and
`code_challenge` for every authorization request, even when the server also
supports `state`.

```ts
let code_verifier = client.randomPKCECodeVerifier()
let code_challenge = await client.calculatePKCECodeChallenge(code_verifier)

let redirectTo = client.buildAuthorizationUrl(config, {
  redirect_uri,
  scope,
  code_challenge,
  code_challenge_method: 'S256',
})
```

Store the `code_verifier` in the user's session so it can be recovered during
the callback.

## Validate state when the server does not advertise PKCE support

When the server metadata does not list `S256` in
`code_challenge_methods_supported`, add a `state` parameter as an additional
CSRF protection layer:

```ts
if (!config.serverMetadata().supportsPKCE()) {
  let state = client.randomState()
  parameters.state = state
  // Store state in session alongside code_verifier
}
```

## Use sender-constrained tokens (DPoP)

When the authorization server supports DPoP, sender-constraining access tokens
prevents them from being replayed by an attacker who intercepts them:

```ts
let keyPair = await client.randomDPoPKeyPair()
let DPoP = client.getDPoPHandle(config, keyPair)

let tokens = await client.authorizationCodeGrant(config, currentUrl, checks, undefined, { DPoP })

let response = await client.fetchProtectedResource(
  config,
  tokens.access_token,
  resourceUrl,
  'GET',
  undefined,
  undefined,
  { DPoP },
)
```

## Keep secrets out of client-side code

- Never embed `client_secret` in browser-side JavaScript. Use public clients
  (`client.None()`) with PKCE for browser-based flows.
- For server-side applications, load secrets from environment variables or a
  secrets manager — not from source code.

## Enforce HTTPS in production

The library enforces HTTPS by default. Only disable this for local development:

```ts
// ONLY for local development
let config = await client.discovery(server, clientId, clientSecret, undefined, {
  execute: [client.allowInsecureRequests],
})
```

Never deploy `allowInsecureRequests` to production environments.

## Validate nonce for OpenID Connect

When using OpenID Connect (with an ID Token), always pass a `nonce` in the
authorization request and validate it in the callback:

```ts
let nonce = client.randomNonce()
// Include nonce in the authorization URL parameters
// Store nonce in user session

// During callback:
let tokens = await client.authorizationCodeGrant(config, currentUrl, {
  pkceCodeVerifier: code_verifier,
  expectedNonce: nonce,
})
```

## Restrict token lifetime with max_age

Use `maxAge` to enforce re-authentication after a specific duration. This
ensures the user has actively authenticated within the required timeframe:

```ts
let tokens = await client.authorizationCodeGrant(config, currentUrl, {
  pkceCodeVerifier: code_verifier,
  expectedNonce: nonce,
  maxAge: 3600, // Require authentication within the last hour
})
```

## Handle token storage securely

- Store tokens server-side in encrypted sessions whenever possible.
- If tokens must be stored client-side (e.g., in a single-page application),
  use `HttpOnly`, `Secure`, `SameSite=Strict` cookies or a backend-for-frontend
  (BFF) pattern.
- Never store tokens in `localStorage` for sensitive applications — prefer
  session-bound, server-side storage.

## Use mTLS for high-security deployments

For FAPI or other high-security profiles, use Mutual TLS to both authenticate
the client and sender-constrain access tokens:

```ts
let clientMetadata = { use_mtls_endpoint_aliases: true }
let config = await client.discovery(
  server,
  clientId,
  clientMetadata,
  client.TlsClientAuth(),
)
```

Combine with a custom fetch implementation that presents the client certificate.

## Rotate secrets and keys

- Rotate `client_secret` values periodically and update the
  `Configuration` accordingly.
- For `private_key_jwt` authentication, support key rollover by updating the
  JWKS registered at the authorization server before decommissioning old keys.
- For DPoP, generate fresh key pairs per session or per a defined lifecycle —
  do not reuse a single DPoP key indefinitely.

## Related resources

- [SECURITY.md](../../SECURITY.md) — Threat model and vulnerability reporting
- [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OpenID Connect Core Security Considerations](https://openid.net/specs/openid-connect-core-1_0.html#Security)

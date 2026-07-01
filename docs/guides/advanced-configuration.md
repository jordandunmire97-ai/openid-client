# Advanced configuration recipes

These recipes cover the main knobs that are often needed in production
deployments.

## Choose a client authentication method

`openid-client` supports body, Basic, JWT-based, mTLS, and unauthenticated
client authentication methods. Pick the method that matches the authorization
server registration for your client.

```ts
let server!: URL
let clientId!: string
let clientSecret!: string
let privateKey!: client.CryptoKey | client.PrivateKey

let basic = await client.discovery(
  server,
  clientId,
  clientSecret,
  client.ClientSecretBasic(),
)

let jwt = await client.discovery(
  server,
  clientId,
  undefined,
  client.PrivateKeyJwt(privateKey),
)
```

## Override fetch and request timeouts

Use a custom fetch to inject runtime-specific behavior such as proxies,
connection pooling, or tracing.

```ts
let config!: client.Configuration

config.timeout = 15
config[client.customFetch] = (url, options) => fetch(url, options)
```

## Persist the JWKS cache between invocations

This is primarily useful in runtimes where memory is not retained between
requests.

```ts
let config!: client.Configuration

let exported = client.getJwksCache(config)

if (exported) {
  client.setJwksCache(config, exported)
}
```

## Enable encrypted responses

```ts
let config!: client.Configuration
let decryptionKey!: client.CryptoKey | client.DecryptionKey

client.enableDecryptingResponses(config, ['A256GCM'], decryptionKey)
```

## Turn on JARM or detached signature checks

```ts
let config!: client.Configuration

client.useJwtResponseMode(config)
client.useCodeIdTokenResponseType(config)
client.enableDetachedSignatureResponseChecks(config)
```

## Combine PAR, JAR, and DPoP

```ts
let config!: client.Configuration
let redirect_uri!: string
let scope!: string
let signingKey!: client.CryptoKey | client.PrivateKey
let DPoPKeys!: client.CryptoKeyPair

let DPoP = client.getDPoPHandle(config, DPoPKeys)
let code_verifier = client.randomPKCECodeVerifier()
let code_challenge = await client.calculatePKCECodeChallenge(code_verifier)

let { searchParams: requestObject } = await client.buildAuthorizationUrlWithJAR(
  config,
  {
    redirect_uri,
    scope,
    code_challenge,
    code_challenge_method: 'S256',
  },
  signingKey,
)

let redirectTo = await client.buildAuthorizationUrlWithPAR(
  config,
  requestObject,
  { DPoP },
)
```

## Related examples

- [DPoP](../../examples/dpop.ts)
- [JAR](../../examples/jar.ts)
- [PAR](../../examples/par.ts)
- [Dynamic Client Registration](../../examples/dcr.ts)

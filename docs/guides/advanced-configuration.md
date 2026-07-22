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

For long-lived processes, prefer reusing a single `Configuration` instance and a
single transport implementation so connection pooling and retry behavior stay
warm across requests. In Node.js this usually means wiring
`config[client.customFetch]` to an `undici` dispatcher or another fetch wrapper
that already manages keep-alive, proxies, retries, or tracing for the whole
application.

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

If your deployment also re-discovers the authorization server frequently,
combine persisted JWKS data with preloaded metadata or a reused
`Configuration` instance so the hot path avoids repeated network round-trips.

## Production performance checklist

For the lowest request overhead in production:

- Reuse the same `Configuration` instance whenever your runtime keeps memory
  between requests.
- Set `config.timeout` to match the latency budget of your application instead
  of relying on the default for every deployment.
- Route `config[client.customFetch]` through the same transport layer you use
  elsewhere for pooling, proxies, retries, and observability.
- Persist JWKS cache data in stateless environments so key lookups do not start
  cold on every invocation.
- Reuse DPoP key material when your deployment model allows it, rather than
  generating a new key pair for each request.

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

## Enable telemetry callbacks

Use `enableTelemetry` to attach lightweight instrumentation to all HTTP
requests and responses made by the library. This is useful for metrics,
distributed tracing, or structured logging.

```ts
let config!: client.Configuration

client.enableTelemetry(config, {
  onRequest(url, options) {
    console.log('outbound', options.method, url)
  },
  onResponse(url, options, resp, durationMs) {
    console.log('inbound', resp.status, durationMs + 'ms')
  },
  onError(url, options, err) {
    console.error('request failed', err)
  },
})
```

> **Security note:** The `onRequest` callback receives the full `options`
> object, which may contain `Authorization` headers, DPoP proof tokens, client
> secrets in `application/x-www-form-urlencoded` bodies, and other
> credentials. Do **not** log the raw options or their headers without first
> redacting sensitive fields. Treat callback options as potentially secret
> material and never transmit them to third-party services without explicit
> sanitisation.

Calling `enableTelemetry` more than once on the same `Configuration` instance
chains the callbacks with the previous registrations — each call adds another
instrumentation layer that wraps the existing one.

## Related examples

- [DPoP](../../examples/dpop.ts)
- [JAR](../../examples/jar.ts)
- [PAR](../../examples/par.ts)
- [Dynamic Client Registration](../../examples/dcr.ts)

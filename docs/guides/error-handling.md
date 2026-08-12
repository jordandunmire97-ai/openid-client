# Error handling and troubleshooting

This guide explains the error types emitted by `openid-client`, their error
codes, and common remediation steps.

## Error hierarchy

| Error class | When thrown |
| --- | --- |
| `ClientError` | General client-side errors (discovery failures, configuration issues, timeouts) |
| `AuthorizationResponseError` | The authorization server returned an OAuth error in the authorization response |
| `ResponseBodyError` | The authorization server returned an error in a token or resource response body |
| `WWWAuthenticateChallengeError` | A protected resource responded with a `WWW-Authenticate` challenge |
| `TypeError` | Invalid arguments passed to the library's public API |

## Common error codes

| Code | Meaning | Typical remedy |
| --- | --- | --- |
| `ERR_INVALID_ARG_TYPE` | A function argument has the wrong type | Check the API reference for expected types |
| `ERR_INVALID_ARG_VALUE` | A function argument has an invalid value | Verify the value meets documented constraints |
| `OAUTH_TIMEOUT` | The HTTP request exceeded the configured timeout | Increase `config.timeout` or check network connectivity |
| `OAUTH_ABORT` | The operation was explicitly aborted via an `AbortSignal` | Ensure your signal is not being triggered prematurely |
| `HTTP_REQUEST_FORBIDDEN` | A request to an insecure (non-HTTPS) endpoint was blocked | Use `allowInsecureRequests` for local development or fix the URL |
| `REQUEST_PROTOCOL_FORBIDDEN` | A URL with a disallowed protocol scheme was used | Ensure the URL uses `http:` or `https:` |
| `RESPONSE_IS_NOT_CONFORM` | The server returned an unexpected HTTP status code | Check the authorization server health and configuration |
| `RESPONSE_IS_NOT_JSON` | The response content-type is not `application/json` | The server may be returning an error page; check the endpoint URL |
| `PARSE_ERROR` | Failed to parse a response body or JWT | Check server responses for malformed payloads |
| `INVALID_RESPONSE` | The response did not match expected protocol structure | Verify the server implements the expected specification |
| `JWT_CLAIM_COMPARISON` | A JWT claim value did not match the expected value | Check issuer, audience, and other claim configurations |
| `JSON_ATTRIBUTE_COMPARISON` | A JSON attribute did not match the expected value | Often an issuer mismatch during discovery |
| `JWT_TIMESTAMP_CHECK` | A JWT time-based claim (exp, iat, nbf) failed validation | Check clock synchronization; consider using `clockSkew` or `clockTolerance` |
| `UNSUPPORTED_OPERATION` | The requested operation is not supported by the runtime or configuration | Check that the runtime supports the required cryptographic algorithms |
| `OAUTH_DECRYPTION_FAILED` | JWE decryption failed (no key matched or decryption error) | Verify the decryption key matches the server's encryption key |

## Handling errors in practice

```ts
import * as client from 'openid-client'

try {
  let tokens = await client.authorizationCodeGrant(config, getCurrentUrl(), {
    pkceCodeVerifier: code_verifier,
    expectedState: state,
  })
} catch (err) {
  if (err instanceof client.AuthorizationResponseError) {
    // The authorization server returned an error
    console.error('Authorization error:', err.error, err.error_description)
  } else if (err instanceof client.ResponseBodyError) {
    // Token endpoint returned an error
    console.error('Token error:', err.error, err.error_description)
  } else if (err instanceof client.ClientError) {
    // A client-level error (timeout, network, validation)
    console.error('Client error:', err.message, err.code)
  } else {
    throw err
  }
}
```

## Clock skew issues

When tokens are rejected due to time-based claim failures (e.g., `exp` or `nbf`
checks), the client and server clocks may be out of sync. Use `clockSkew` and
`clockTolerance` to compensate:

```ts
let clientMetadata: client.ClientMetadata = {
  client_id: 'my-client-id',
  [client.clockSkew]: 60, // assume local clock is 60 seconds behind
  [client.clockTolerance]: 30, // allow 30 seconds leeway on time claims
}
```

## Discovery issuer mismatch

If discovery fails with a `JSON_ATTRIBUTE_COMPARISON` error, the `issuer`
returned in the server metadata does not match the URL you provided. Common
causes:

- A trailing slash difference (e.g., `https://example.com` vs
  `https://example.com/`)
- The server returns a different issuer than expected (multi-tenant setups)
- Azure AD B2C or Microsoft Entra ID multi-tenant patterns — these are handled
  automatically

## Timeout tuning

The default timeout for HTTP requests is 30 seconds. Adjust it per
`Configuration` instance:

```ts
let config = await client.discovery(server, clientId, clientSecret, undefined, {
  timeout: 10, // 10 second timeout for discovery and all subsequent requests
})

// Or change it after construction:
config.timeout = 15
```

## Insecure requests during development

For local development against servers without TLS:

```ts
let config = await client.discovery(
  new URL('http://localhost:9000'),
  clientId,
  clientSecret,
  undefined,
  {
    execute: [client.allowInsecureRequests],
  },
)
```

> [!WARNING]\
> Never use `allowInsecureRequests` in production. It disables TLS validation
> which removes a critical security layer.

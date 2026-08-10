# Interface: BackchannelAuthenticationGrantPollOptions

[💗 Help the project](https://github.com/sponsors/panva)

Support from the community to continue maintaining and improving this module is welcome. If you find the module useful, please consider supporting the project by [becoming a sponsor](https://github.com/sponsors/panva).

***

## Properties

### DPoP?

• `optional` **DPoP?**: [`DPoPHandle`](DPoPHandle.md)

DPoP handle to use for requesting a sender-constrained access token.
Usually obtained from [getDPoPHandle](../functions/getDPoPHandle.md)

#### See

[RFC 9449 - OAuth 2.0 Demonstrating Proof of Possession (DPoP)](https://www.rfc-editor.org/rfc/rfc9449.html)

***

### signal?

• `optional` **signal?**: [`AbortSignal`](https://developer.mozilla.org/docs/Web/API/AbortSignal)

AbortSignal to abort polling. Default is that the operation will time out
after the indicated expires_in property returned by the server in
[initiateBackchannelAuthentication](../functions/initiateBackchannelAuthentication.md)

***

### adaptivePolling?

• `optional` **adaptivePolling?**: `boolean`

Enables adaptive poll interval backoff. When enabled, the next poll
interval increases after retry-worthy responses such as
`authorization_pending`, `slow_down`, and `503` responses.

***

### minIntervalSeconds?

• `optional` **minIntervalSeconds?**: `number`

Lower bound in seconds for adaptive polling interval.

***

### maxIntervalSeconds?

• `optional` **maxIntervalSeconds?**: `number`

Upper bound in seconds for adaptive polling interval.

***

### backoffMultiplier?

• `optional` **backoffMultiplier?**: `number`

Multiplicative step for adaptive polling interval updates.

***

### jitterRatio?

• `optional` **jitterRatio?**: `number`

Jitter ratio applied to adaptive polling intervals to reduce synchronized
poll bursts. Use values between `0` and `1`.

***

### onRetry?

• `optional` **onRetry?**: (`event`) => `void`

Called when polling decides the next retry interval.

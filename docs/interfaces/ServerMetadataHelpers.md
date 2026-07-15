# Interface: ServerMetadataHelpers

[💗 Help the project](https://github.com/sponsors/panva)

Support from the community to continue maintaining and improving this module is welcome. If you find the module useful, please consider supporting the project by [becoming a sponsor](https://github.com/sponsors/panva).

***

## Methods

### supportsPKCE()

▸ **supportsPKCE**(`method?`): `boolean`

Determines whether the Authorization Server supports a given Code Challenge
Method

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `method?` | `string` | Code Challenge Method. Default is `S256` |

#### Returns

`boolean`

### supportsGrantType()

▸ **supportsGrantType**(`grantType`): `boolean`

Determines whether the Authorization Server supports a given grant type.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `grantType` | `string` | Grant type |

#### Returns

`boolean`

### supportsResponseType()

▸ **supportsResponseType**(`responseType`): `boolean`

Determines whether the Authorization Server supports a given response type.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `responseType` | `string` | Response type |

#### Returns

`boolean`

### supportsResponseMode()

▸ **supportsResponseMode**(`responseMode`): `boolean`

Determines whether the Authorization Server supports a given response mode.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `responseMode` | `string` | Response mode |

#### Returns

`boolean`

### supportsTokenEndpointAuthMethod()

▸ **supportsTokenEndpointAuthMethod**(`method`): `boolean`

Determines whether the Authorization Server supports a given token endpoint
client authentication method.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `method` | `string` | Token endpoint client authentication method |

#### Returns

`boolean`

### supportsAuthorizationSigningAlgorithm()

▸ **supportsAuthorizationSigningAlgorithm**(`algorithm`): `boolean`

Determines whether the Authorization Server supports a given authorization
response signing algorithm.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `algorithm` | `string` | JSON Web Signature algorithm |

#### Returns

`boolean`

### supportsUserInfoSigningAlgorithm()

▸ **supportsUserInfoSigningAlgorithm**(`algorithm`): `boolean`

Determines whether the Authorization Server supports a given UserInfo response
signing algorithm.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `algorithm` | `string` | JSON Web Signature algorithm |

#### Returns

`boolean`

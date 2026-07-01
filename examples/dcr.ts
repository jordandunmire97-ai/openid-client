import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientPrivateKey!: client.CryptoKey | client.PrivateKey
let jwks!: client.JWKS
/**
 * Authorization request callback URLs pre-registered at the Authorization
 * Server.
 */
let redirect_uris!: string[]

// End of prerequisites

let config = await client.dynamicClientRegistration(
  server,
  {
    application_type: 'web',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris,
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    jwks,
  },
  client.PrivateKeyJwt(clientPrivateKey),
)

console.log('Registered Client Metadata', config.clientMetadata())

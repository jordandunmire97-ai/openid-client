import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string
let clientSecret!: string
/**
 * Refresh Token obtained from a previous grant response.
 */
let refresh_token!: string

// End of prerequisites

let config = await client.discovery(server, clientId, clientSecret)

let refreshedTokens = await client.refreshTokenGrant(config, refresh_token)

console.log('Refreshed Token Response', refreshedTokens)

let introspection = await client.tokenIntrospection(
  config,
  refreshedTokens.access_token,
  {
    token_type_hint: 'access_token',
  },
)

console.log('Introspection Response', introspection)

await client.tokenRevocation(config, refresh_token, {
  token_type_hint: 'refresh_token',
})

console.log('Refresh token revoked')

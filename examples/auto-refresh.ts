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

let tokens = await client.refreshTokenGrant(config, refresh_token)

let { response, tokens: currentTokens, refreshError } =
  await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api'),
    'GET',
  )

// Always persist the returned token set. It may contain refreshed values.
await saveTokenSet(currentTokens)

if (refreshError) {
  console.warn('Refresh failed while retrying the resource request', refreshError)
}

console.log('Protected Resource Response', await response.json())

async function saveTokenSet(
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
) {
  void tokens
}

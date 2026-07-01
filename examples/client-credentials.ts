import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string
let clientSecret!: string
let scope!: string
let resource!: string // Resource Indicator of the Resource Server

// End of prerequisites

let config = await client.discovery(server, clientId, clientSecret)

let tokens = await client.clientCredentialsGrant(config, {
  scope,
  resource,
})

console.log('Token Endpoint Response', tokens)

let protectedResource = await client.fetchProtectedResource(
  config,
  tokens.access_token,
  new URL('https://rs.example.com/api'),
  'GET',
)

console.log('Protected Resource Response', await protectedResource.json())

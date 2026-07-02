import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string
let clientSecret!: string
/**
 * Access Token to be exchanged (the subject token).
 */
let subjectToken!: string

// End of prerequisites

let config = await client.discovery(server, clientId, clientSecret)

let tokens = await client.tokenExchangeGrant(config, {
  subject_token: subjectToken,
  subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  audience: 'https://target-service.example.com',
})

console.log('Token Exchange Response', tokens)

let protectedResource = await client.fetchProtectedResource(
  config,
  tokens.access_token,
  new URL('https://rs.example.com/api'),
  'GET',
)

console.log('Protected Resource Response', await protectedResource.json())

import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string
let clientSecret!: string
let scope!: string

// End of prerequisites

let config = await client.discovery(server, clientId, clientSecret)

let deviceAuthorizationResponse = await client.initiateDeviceAuthorization(
  config,
  { scope },
)

console.log('User Code:', deviceAuthorizationResponse.user_code)
console.log('Verification URI:', deviceAuthorizationResponse.verification_uri)
console.log(
  'Verification URI (complete):',
  deviceAuthorizationResponse.verification_uri_complete,
)

let tokens = await client.pollDeviceAuthorizationGrant(
  config,
  deviceAuthorizationResponse,
)

console.log('Token Endpoint Response', tokens)

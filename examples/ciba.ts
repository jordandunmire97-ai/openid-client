import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string
let clientSecret!: string
let scope!: string
/**
 * One of login_hint, id_token_hint, or login_hint_token parameters must be
 * provided in CIBA.
 */
let login_hint!: string

// End of prerequisites

let config = await client.discovery(server, clientId, clientSecret)

let backchannelAuthenticationResponse =
  await client.initiateBackchannelAuthentication(config, {
    scope,
    login_hint,
  })

console.log(
  'Authentication Request ID:',
  backchannelAuthenticationResponse.auth_req_id,
)

let tokens = await client.pollBackchannelAuthenticationGrant(
  config,
  backchannelAuthenticationResponse,
)

console.log('Token Endpoint Response', tokens)

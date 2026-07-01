import * as client from 'openid-client'

// Prerequisites

let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string
let clientSecret!: string
let post_logout_redirect_uri!: string
/**
 * Typically obtained from a previous OpenID Connect authorization response.
 */
let id_token!: string

// End of prerequisites

let config = await client.discovery(server, clientId, clientSecret)

let redirectTo = client.buildEndSessionUrl(config, {
  post_logout_redirect_uri,
  id_token_hint: id_token,
})

console.log('redirecting to', redirectTo.href)

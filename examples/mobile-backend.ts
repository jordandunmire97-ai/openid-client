import * as client from 'openid-client'

import express from 'express'
import session from 'express-session'
import crypto from 'node:crypto'

// Prerequisites
let server!: URL // Authorization server's Issuer Identifier URL
let clientId!: string // Client identifier at the Authorization Server
let clientSecret!: string // Client Secret
/**
 * In this example it is expected your application's origin + '/callback' is
 * registered as an allowed redirect URL at the Authorization Server.
 */
let redirect_uri!: string
let sessionSecret!: string // Secret to sign session cookies with
let deepLinkUrl!: string // e.g., 'myapp://login-success'

// End of prerequisites

declare module 'express-session' {
  interface SessionData {
    code_verifier: string | undefined
    nonce: string | undefined
  }
}

let config = await client.discovery(server, clientId, clientSecret)

let app = express()

app.use(
  session({
    saveUninitialized: false,
    resave: false,
    secret: sessionSecret,
  }),
)

/**
 * Phase 2 - Step 2: The Login Endpoint When the phone app wants to log in, it
 * opens a system browser (e.g. ASWebAuthenticationSession) to this endpoint.
 * This route generates PKCE values, stores them, and redirects the user to the
 * IdP's authorization endpoint.
 */
app.get('/auth/login', async (req, res) => {
  let code_verifier = client.randomPKCECodeVerifier()
  let code_challenge = await client.calculatePKCECodeChallenge(code_verifier)

  let parameters: Record<string, string> = {
    redirect_uri,
    scope: 'openid email profile',
    code_challenge,
    code_challenge_method: 'S256',
  }

  let nonce: string | undefined
  if (!config.serverMetadata().supportsPKCE()) {
    nonce = client.randomNonce()
    parameters.nonce = nonce
  }

  // Store the PKCE verifier and optional nonce securely in the temporary session
  req.session.code_verifier = code_verifier
  req.session.nonce = nonce

  let redirectTo = client.buildAuthorizationUrl(config, parameters)

  res.redirect(redirectTo.href)
})

/**
 * Phase 2 - Step 3: The Callback Endpoint After the user authenticates, the IdP
 * redirects to this endpoint. We exchange the code for tokens, validate the ID
 * token, and then redirect back to the phone app using a custom deep link.
 */
app.get('/auth/callback', async (req, res) => {
  let { code_verifier, nonce } = req.session

  if (!code_verifier) {
    res.status(400).send('Missing session state. Please start login again.')
    return
  }

  let currentUrl = new URL(
    `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  )

  let tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: code_verifier,
    expectedNonce: nonce,
    idTokenExpected: true,
  })

  let claims = tokens.claims()!
  console.log('User authenticated:', claims.sub)

  // Clean up single-use PKCE values
  delete req.session.code_verifier
  delete req.session.nonce

  // In a real application, you would create a session in your database here
  // and generate an API token for your mobile app to use for future API requests.
  let apiToken = crypto.randomBytes(32).toString('hex')
  // e.g. await db.createSession(claims.sub, apiToken)

  // Redirect the user back to the phone app using the custom deep link
  // passing along the secure session token
  let phoneAppRedirect = new URL(deepLinkUrl)
  phoneAppRedirect.searchParams.set('token', apiToken)

  res.redirect(phoneAppRedirect.href)
})

app.listen(3000, () => {
  console.log('Listening on http://localhost:3000')
})

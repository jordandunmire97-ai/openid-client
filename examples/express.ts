import * as client from 'openid-client'

import express from 'express'
import session from 'express-session'

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

// End of prerequisites

declare module 'express-session' {
  interface SessionData {
    code_verifier: string
    nonce: string | undefined
    sub: string
    access_token: string
    id_token: string | undefined
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
 * Login route — generates PKCE values, stores them in the session, then
 * redirects the user to the Authorization Server's authorization endpoint.
 */
app.get('/login', async (req, res) => {
  let code_verifier = client.randomPKCECodeVerifier()
  let code_challenge = await client.calculatePKCECodeChallenge(code_verifier)

  let parameters: Record<string, string> = {
    redirect_uri,
    scope: 'openid email',
    code_challenge,
    code_challenge_method: 'S256',
  }

  /**
   * We cannot be sure the AS supports PKCE so we're going to use nonce too. Use
   * of PKCE is backwards compatible even if the AS doesn't support it which is
   * why we're using it regardless.
   */
  let nonce: string | undefined
  if (!config.serverMetadata().supportsPKCE()) {
    nonce = client.randomNonce()
    parameters.nonce = nonce
  }

  // Store the PKCE verifier and optional nonce in the session so they can be
  // recovered when the user is redirected back by the Authorization Server.
  req.session.code_verifier = code_verifier
  req.session.nonce = nonce

  let redirectTo = client.buildAuthorizationUrl(config, parameters)

  res.redirect(redirectTo.href)
})

/**
 * Callback route — the Authorization Server redirects here after the user
 * authenticates. Exchange the authorization code for tokens, store the
 * resulting token claims in the session, then redirect to the home page.
 */
app.get('/callback', async (req, res) => {
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
  req.session.sub = claims.sub
  req.session.access_token = tokens.access_token!
  req.session.id_token = tokens.id_token

  // Clean up PKCE values — they are single-use
  delete req.session.code_verifier
  delete req.session.nonce

  res.redirect('/')
})

/**
 * Home route — shows the logged-in user's subject identifier, or redirects to
 * login if there is no active session.
 */
app.get('/', async (req, res) => {
  let { sub, access_token } = req.session

  if (!sub || !access_token) {
    res.redirect('/login')
    return
  }

  let userInfo = await client.fetchUserInfo(config, access_token, sub)

  res.send(`Welcome ${userInfo.email ?? userInfo.sub}`)
})

/**
 * Logout route — destroys the local session and, when the Authorization Server
 * supports RP-initiated logout, redirects there so the server-side session is
 * also terminated.
 */
app.get('/logout', (req, res) => {
  let id_token = req.session.id_token

  req.session.destroy(() => {
    if (
      config.serverMetadata().end_session_endpoint &&
      id_token !== undefined
    ) {
      let logoutUrl = client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: `${req.protocol}://${req.get('host')}`,
        id_token_hint: id_token,
      })
      res.redirect(logoutUrl.href)
    } else {
      res.redirect('/')
    }
  })
})

app.listen(3000, () => {
  console.log('Listening on http://localhost:3000')
})

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
let resourceServerUrl!: URL // e.g., 'https://rs.example.com/api/me'

// End of prerequisites

declare module 'express-session' {
  interface SessionData {
    code_verifier?: string
    nonce?: string
    tokens?: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
  }
}

let config = await client.discovery(server, clientId, clientSecret)

// Enable a conservative profile tuned for phones on variable networks.
client.enableMobileConservativeProfile(config, {
  timeoutSeconds: 12,
  refreshThresholdSeconds: 25,
  refreshJitterSeconds: 6,
  pollMinIntervalSeconds: 2,
  pollMaxIntervalSeconds: 45,
  pollBackoffMultiplier: 1.6,
  pollJitterRatio: 0.1,
})

// Diagnostics collector records request counts, latency, refresh outcomes, and
// challenge classifications for observability in mobile deployments.
let diagnostics = client.createMobileDiagnosticsCollector()
client.enableTelemetry(config, diagnostics)

let app = express()

app.use(
  session({
    saveUninitialized: false,
    resave: false,
    secret: sessionSecret,
  }),
)

/**
 * GET /auth/login
 *
 * The phone app opens a system browser (e.g. ASWebAuthenticationSession) to this
 * endpoint. The route generates PKCE values, stores them, and redirects the user
 * to the Authorization Server's authorization endpoint.
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
 * GET /auth/callback
 *
 * After the user authenticates, the Authorization Server redirects here. The
 * code is exchanged for tokens, the ID Token is validated, and the phone app is
 * sent back via a custom deep link.
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

  // Persist tokens in the server-side session; the app receives a short-lived
  // session handle instead of the actual OAuth tokens.
  req.session.tokens = tokens

  // In a real application, create a session in your database here and generate
  // an API token for the mobile app to use for future API requests.
  let apiToken = crypto.randomBytes(32).toString('hex')
  // e.g. await db.createSession(claims.sub, apiToken)

  let phoneAppRedirect = new URL(deepLinkUrl)
  phoneAppRedirect.searchParams.set('token', apiToken)

  res.redirect(phoneAppRedirect.href)
})

/**
 * GET /api/me
 *
 * Authenticated phone API endpoint. It forwards the request to the resource
 * server on behalf of the user, proactively refreshing the access token when it
 * is close to expiry. The diagnostics collector tracks refresh outcomes and
 * request latency.
 */
app.get('/api/me', async (req, res) => {
  let { tokens } = req.session

  if (!tokens) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    let { response, tokens: currentTokens } =
      await client.fetchProtectedResourceWithAutoRefresh(
        config,
        tokens,
        resourceServerUrl,
        'GET',
        undefined,
        undefined,
        {
          onRefresh: diagnostics.recordRefresh,
          onChallenge: diagnostics.recordChallenge,
        },
      )

    // Always persist the returned tokens — they may have been refreshed.
    req.session.tokens = currentTokens

    res.status(response.status)
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.send(Buffer.from(await response.arrayBuffer()))
  } catch (err) {
    // Surface authentication errors so the phone app can trigger re-login.
    if (err instanceof client.AuthorizationResponseError) {
      res.status(401).json({
        error: err.error,
        error_description: err.error_description,
      })
      return
    }

    if (err instanceof client.ResponseBodyError) {
      res.status(502).json({
        error: err.error,
        error_description: err.error_description,
      })
      return
    }

    throw err
  }
})

/**
 * GET /health
 *
 * Exposes a small diagnostics snapshot useful for monitoring the phone backend
 * in production (request counts, refresh success rate, network errors).
 */
app.get('/health', (_req, res) => {
  res.json(diagnostics.snapshot())
})

/**
 * POST /reset-diagnostics
 *
 * Resets the diagnostics counters. Useful after deploying a new app version or
 * during staged rollouts.
 */
app.post('/reset-diagnostics', (_req, res) => {
  diagnostics.reset()
  res.status(204).end()
})

app.listen(3000, () => {
  console.log('Listening on http://localhost:3000')
})

import test from 'ava'
import * as client from '../src/index.js'
import * as undici from 'undici'

function createConfig(agent: undici.MockAgent) {
  const config = new client.Configuration(
    {
      issuer: 'https://as.example.com',
      token_endpoint: 'https://as.example.com/token',
      introspection_endpoint: 'https://as.example.com/introspect',
      revocation_endpoint: 'https://as.example.com/revoke',
      end_session_endpoint: 'https://as.example.com/logout',
    },
    'test-client-id',
    'test-client-secret',
  )

  // @ts-ignore
  config[client.customFetch] = (url, options) => {
    return undici.fetch(url, { ...options, dispatcher: agent })
  }

  return config
}

test('refreshTokenGrant forwards additional parameters', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)

  mockAgent
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const params = new URLSearchParams(body)
        t.is(params.get('grant_type'), 'refresh_token')
        t.is(params.get('refresh_token'), 'refresh-token-value')
        t.is(params.get('scope'), 'openid profile')
        t.is(params.get('resource'), 'urn:example:resource')
        return true
      },
    })
    .reply(
      200,
      {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    )

  const result = await client.refreshTokenGrant(config, 'refresh-token-value', {
    scope: 'openid profile',
    resource: 'urn:example:resource',
  })

  t.is(result.access_token, 'new-access-token')
  t.is(result.refresh_token, 'new-refresh-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh does not retry a stream body', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)
  let requestCount = 0

  mockRsAgent
    .intercept({
      method: 'POST',
      path: '/api/resource',
    })
    .reply(
      401,
      () => {
        requestCount++
        return { error: 'expired_token' }
      },
      {
        headers: {
          'content-type': 'application/json',
          'www-authenticate': 'Bearer error="invalid_token"',
        },
      },
    )

  const tokens = {
    access_token: 'expired-access-token',
    refresh_token: 'refresh-token-value',
    token_type: 'bearer',
    expiresIn() {
      return Infinity
    },
  } as client.TokenEndpointResponse & client.TokenEndpointResponseHelpers

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/resource'),
    'POST',
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      },
    }),
  )

  t.is(result.response.status, 401)
  t.is(requestCount, 1)
  t.is(result.tokens, tokens)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('tokenIntrospection forwards token type hint', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)

  mockAgent
    .intercept({
      method: 'POST',
      path: '/introspect',
      body(body) {
        const params = new URLSearchParams(body)
        t.is(params.get('token'), 'access-token-value')
        t.is(params.get('token_type_hint'), 'access_token')
        return true
      },
    })
    .reply(
      200,
      {
        active: true,
        sub: '248289761001',
      },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    )

  const result = await client.tokenIntrospection(config, 'access-token-value', {
    token_type_hint: 'access_token',
  })

  t.true(result.active)
  t.is(result.sub, '248289761001')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('tokenRevocation forwards token type hint', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)

  mockAgent
    .intercept({
      method: 'POST',
      path: '/revoke',
      body(body) {
        const params = new URLSearchParams(body)
        t.is(params.get('token'), 'refresh-token-value')
        t.is(params.get('token_type_hint'), 'refresh_token')
        return true
      },
    })
    .reply(200, '', {
      headers: {
        'content-type': 'application/json',
      },
    })

  await t.notThrowsAsync(
    client.tokenRevocation(config, 'refresh-token-value', {
      token_type_hint: 'refresh_token',
    }),
  )

  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('buildEndSessionUrl includes client_id and provided parameters', (t) => {
  const config = new client.Configuration(
    {
      issuer: 'https://as.example.com',
      end_session_endpoint: 'https://as.example.com/logout',
    },
    'test-client-id',
  )

  const url = client.buildEndSessionUrl(config, {
    post_logout_redirect_uri: 'https://rp.example.com/logout/callback',
    id_token_hint: 'id-token-value',
  })

  t.is(
    url.href,
    'https://as.example.com/logout?post_logout_redirect_uri=https%3A%2F%2Frp.example.com%2Flogout%2Fcallback&id_token_hint=id-token-value&client_id=test-client-id',
  )
})

test('clientCredentialsGrant sends correct grant type and parameters', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)

  mockAgent
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const params = new URLSearchParams(body)
        t.is(params.get('grant_type'), 'client_credentials')
        t.is(params.get('scope'), 'read write')
        t.is(params.get('resource'), 'urn:example:api')
        return true
      },
    })
    .reply(
      200,
      {
        access_token: 'cc-access-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
      {
        headers: {
          'content-type': 'application/json',
        },
      },
    )

  const result = await client.clientCredentialsGrant(config, {
    scope: 'read write',
    resource: 'urn:example:api',
  })

  t.is(result.access_token, 'cc-access-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResource sets Authorization header with exact ****** token value', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return headers['authorization'] === 'Bearer my-access-token'
      },
    })
    .reply(
      200,
      { data: 'protected' },
      { headers: { 'content-type': 'application/json' } },
    )

  const response = await client.fetchProtectedResource(
    config,
    'my-access-token',
    new URL('https://rs.example.com/api/resource'),
    'GET',
  )

  t.is(response.status, 200)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - no refresh when token has sufficient lifetime', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  // Provide initial tokens via a token endpoint mock (expires_in=3600, well above threshold)
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'initial-access-token',
      refresh_token: 'initial-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // Only one resource request expected — no proactive refresh
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        // Exact token value check
        return headers['authorization'] === 'Bearer initial-access-token'
      },
    })
    .reply(
      200,
      { ok: true },
      { headers: { 'content-type': 'application/json' } },
    )

  const { response, tokens: returnedTokens } =
    await client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    )

  t.is(response.status, 200)
  // Token set is unchanged — same object reference
  t.is(returnedTokens, tokens)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - proactive refresh when token is near expiry', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  // Initial tokens with expires_in=10 (below default threshold of 30)
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'expiring-access-token',
      refresh_token: 'expiring-refresh-token',
      token_type: 'bearer',
      expires_in: 10,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // Proactive refresh call
  mockTokenAgent
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const params = new URLSearchParams(body)
        return (
          params.get('grant_type') === 'refresh_token' &&
          params.get('refresh_token') === 'expiring-refresh-token'
        )
      },
    })
    .reply(
      200,
      {
        access_token: 'refreshed-access-token',
        refresh_token: 'refreshed-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
      { headers: { 'content-type': 'application/json' } },
    )

  // Resource request must use the refreshed token (exact value check)
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return headers['authorization'] === 'Bearer refreshed-access-token'
      },
    })
    .reply(
      200,
      { ok: true },
      { headers: { 'content-type': 'application/json' } },
    )

  const { response, tokens: returnedTokens } =
    await client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    )

  t.is(response.status, 200)
  t.is(returnedTokens.access_token, 'refreshed-access-token')
  t.is(returnedTokens.refresh_token, 'refreshed-refresh-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - reactive refresh on 401 with ****** WWW-Authenticate challenge', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  // Initial tokens with plenty of lifetime (no proactive refresh)
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'stale-access-token',
      refresh_token: 'valid-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // First resource request returns 401 with ****** (semantic token expiry)
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return headers['authorization'] === 'Bearer stale-access-token'
      },
    })
    .reply(401, '', {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer error="invalid_token"',
      },
    })

  // Reactive refresh call
  mockTokenAgent
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const params = new URLSearchParams(body)
        return (
          params.get('grant_type') === 'refresh_token' &&
          params.get('refresh_token') === 'valid-refresh-token'
        )
      },
    })
    .reply(
      200,
      {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
      { headers: { 'content-type': 'application/json' } },
    )

  // Retry resource request with new token (exact value check)
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return headers['authorization'] === 'Bearer new-access-token'
      },
    })
    .reply(
      200,
      { ok: true },
      { headers: { 'content-type': 'application/json' } },
    )

  const { response, tokens: returnedTokens } =
    await client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    )

  t.is(response.status, 200)
  t.is(returnedTokens.access_token, 'new-access-token')
  t.is(returnedTokens.refresh_token, 'new-refresh-token')
  t.is(returnedTokens.refreshError, undefined)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - exposes refresh error and returns 401 when reactive refresh fails', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  // Initial tokens with plenty of lifetime
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'stale-access-token',
      refresh_token: 'expired-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // Resource request returns 401 with ******
  mockRsAgent
    .intercept({ method: 'GET', path: '/api/resource' })
    .reply(401, '', {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer error="invalid_token"',
      },
    })

  // Reactive refresh fails with invalid_grant
  mockTokenAgent
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      400,
      { error: 'invalid_grant', error_description: 'Refresh token expired' },
      { headers: { 'content-type': 'application/json' } },
    )

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/resource'),
    'GET',
  )

  // The original 401 is returned when refresh fails
  t.is(result.response.status, 401)
  // Token set is unchanged since refresh failed
  t.is(result.tokens, tokens)
  // The refresh error is exposed, not swallowed
  t.truthy(result.refreshError)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - no reactive refresh when 401 has no WWW-Authenticate', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // 401 with no WWW-Authenticate header — not a semantic token challenge
  mockRsAgent
    .intercept({ method: 'GET', path: '/api/resource' })
    .reply(401, '', { headers: { 'content-type': 'application/json' } })

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/resource'),
    'GET',
  )

  t.is(result.response.status, 401)
  t.is(result.tokens, tokens)
  // No refresh error because no refresh was attempted
  t.is(result.refreshError, undefined)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - no reactive refresh when 401 has non-****** challenge', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // 401 with Basic auth challenge — unrelated to token expiry
  mockRsAgent
    .intercept({ method: 'GET', path: '/api/resource' })
    .reply(401, '', {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Basic realm="example"',
      },
    })

  await t.throwsAsync(
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    ),
    { instanceOf: client.WWWAuthenticateChallengeError },
  )
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - no reactive refresh when 401 error is insufficient_scope', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // 401 with ****** — a refresh with same scope won't help
  mockRsAgent
    .intercept({ method: 'GET', path: '/api/resource' })
    .reply(401, '', {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer error="insufficient_scope"',
      },
    })

  await t.throwsAsync(
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    ),
    { instanceOf: client.WWWAuthenticateChallengeError },
  )
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - POST not retried by default on 401', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)
  let requestCount = 0

  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  mockRsAgent.intercept({ method: 'POST', path: '/api/action' }).reply(
    401,
    () => {
      requestCount++
      return ''
    },
    {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer error="invalid_token"',
      },
    },
  )

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/action'),
    'POST',
    'body-text',
  )

  t.is(result.response.status, 401)
  t.is(requestCount, 1, 'POST must not be retried without explicit opt-in')
  t.is(result.tokens, tokens)
  t.is(result.refreshError, undefined)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - POST retried when retryNonIdempotentRequests is true', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'stale-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  mockRsAgent
    .intercept({
      method: 'POST',
      path: '/api/action',
      headers(h) {
        return h['authorization'] === 'Bearer stale-token'
      },
    })
    .reply(401, '', {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer error="invalid_token"',
      },
    })

  mockTokenAgent
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const p = new URLSearchParams(body)
        return (
          p.get('grant_type') === 'refresh_token' &&
          p.get('refresh_token') === 'refresh-token'
        )
      },
    })
    .reply(
      200,
      {
        access_token: 'fresh-token',
        refresh_token: 'new-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
      { headers: { 'content-type': 'application/json' } },
    )

  mockRsAgent
    .intercept({
      method: 'POST',
      path: '/api/action',
      headers(h) {
        return h['authorization'] === 'Bearer fresh-token'
      },
    })
    .reply(
      200,
      { ok: true },
      { headers: { 'content-type': 'application/json' } },
    )

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/action'),
    'POST',
    'body-text',
    undefined,
    { retryNonIdempotentRequests: true },
  )

  t.is(result.response.status, 200)
  t.is(result.tokens.access_token, 'fresh-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - old refresh_token preserved when response omits it', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  // Initial expiring tokens
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'expiring-token',
      refresh_token: 'old-refresh-token',
      token_type: 'bearer',
      expires_in: 5,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  // Server refreshes but does NOT return a new refresh_token
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'new-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      // refresh_token intentionally omitted
    },
    { headers: { 'content-type': 'application/json' } },
  )

  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(h) {
        return h['authorization'] === 'Bearer new-access-token'
      },
    })
    .reply(
      200,
      { ok: true },
      { headers: { 'content-type': 'application/json' } },
    )

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/resource'),
    'GET',
  )

  t.is(result.response.status, 200)
  t.is(result.tokens.access_token, 'new-access-token')
  // Old refresh token must be preserved (RFC 6749 §6)
  t.is(result.tokens.refresh_token, 'old-refresh-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - old refresh_token preserved after reactive refresh without new token', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'stale-access-token',
      refresh_token: 'old-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed-refresh-token')

  mockRsAgent
    .intercept({ method: 'GET', path: '/api/resource' })
    .reply(401, '', {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer error="invalid_token"',
      },
    })

  // Reactive refresh: server returns new access token but no refresh_token
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'fresh-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      // refresh_token omitted
    },
    { headers: { 'content-type': 'application/json' } },
  )

  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(h) {
        return h['authorization'] === 'Bearer fresh-access-token'
      },
    })
    .reply(
      200,
      { ok: true },
      { headers: { 'content-type': 'application/json' } },
    )

  const result = await client.fetchProtectedResourceWithAutoRefresh(
    config,
    tokens,
    new URL('https://rs.example.com/api/resource'),
    'GET',
  )

  t.is(result.response.status, 200)
  t.is(result.tokens.access_token, 'fresh-access-token')
  // Old refresh token must be preserved
  t.is(result.tokens.refresh_token, 'old-refresh-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - invalid refreshThresholdSeconds throws', async (t) => {
  const agent = new undici.MockAgent()
  agent.disableNetConnect()
  const config = createConfig(agent)

  const mockTokens = {
    access_token: 'tok',
    token_type: 'bearer',
    expiresIn: () => 3600,
  } as client.TokenEndpointResponse & client.TokenEndpointResponseHelpers

  const url = new URL('https://rs.example.com/api')

  await t.throwsAsync(
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      mockTokens,
      url,
      'GET',
      undefined,
      undefined,
      { refreshThresholdSeconds: -1 },
    ),
    { instanceOf: TypeError },
  )

  await t.throwsAsync(
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      mockTokens,
      url,
      'GET',
      undefined,
      undefined,
      { refreshThresholdSeconds: Infinity },
    ),
    { instanceOf: TypeError },
  )

  await t.throwsAsync(
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      mockTokens,
      url,
      'GET',
      undefined,
      undefined,
      { refreshThresholdSeconds: NaN },
    ),
    { instanceOf: TypeError },
  )

  // Zero is valid — should not throw OUR validation error (but may fail on network)
  const zeroThresholdErr = await client
    .fetchProtectedResourceWithAutoRefresh(
      config,
      mockTokens,
      url,
      'GET',
      undefined,
      undefined,
      { refreshThresholdSeconds: 0 },
    )
    .then(
      () => null as unknown,
      (e: unknown) => e,
    )
  // Network errors are expected since no interceptor is set; what must NOT
  // happen is a validation TypeError mentioning refreshThresholdSeconds.
  t.false(
    zeroThresholdErr instanceof TypeError &&
      String((zeroThresholdErr as TypeError).message).includes(
        'refreshThresholdSeconds',
      ),
    'zero is a valid refreshThresholdSeconds',
  )
})

test('fetchProtectedResourceWithAutoRefresh - concurrent proactive refreshes are deduplicated', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockTokenAgent = agent.get('https://as.example.com')
  const mockRsAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)
  let tokenEndpointCallCount = 0

  // Seed refresh to obtain expiring tokens
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'expiring-token',
      refresh_token: 'shared-refresh-token',
      token_type: 'bearer',
      expires_in: 5,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  const tokens = await client.refreshTokenGrant(config, 'seed')

  // Only one token endpoint call expected despite two concurrent callers
  mockTokenAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    () => {
      tokenEndpointCallCount++
      return {
        access_token: 'dedup-access-token',
        refresh_token: 'dedup-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      }
    },
    { headers: { 'content-type': 'application/json' } },
  )

  // Two resource endpoints, one per concurrent call
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(h) {
        return h['authorization'] === 'Bearer dedup-access-token'
      },
    })
    .reply(200, { ok: 1 }, { headers: { 'content-type': 'application/json' } })
    .times(2)

  const [r1, r2] = await Promise.all([
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    ),
    client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    ),
  ])

  t.is(tokenEndpointCallCount, 1, 'Token endpoint must be called exactly once')
  t.is(r1.tokens.access_token, 'dedup-access-token')
  t.is(r2.tokens.access_token, 'dedup-access-token')
  t.is(r1.tokens, r2.tokens, 'Both callers must share the same token object')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

// ---------------------------------------------------------------------------
// Telemetry tests
// ---------------------------------------------------------------------------

test('enableTelemetry - onRequest is called before each request', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)
  const requestedUrls: string[] = []

  client.enableTelemetry(config, {
    onRequest(url) {
      requestedUrls.push(url)
    },
  })

  mockAgent.intercept({ method: 'POST', path: '/token' }).reply(
    200,
    {
      access_token: 'tok',
      token_type: 'bearer',
      expires_in: 3600,
    },
    { headers: { 'content-type': 'application/json' } },
  )

  await client.clientCredentialsGrant(config)

  t.is(requestedUrls.length, 1)
  t.is(new URL(requestedUrls[0]).hostname, 'as.example.com')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('enableTelemetry - onResponse is called with status and positive duration', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)
  let capturedStatus = 0
  let capturedDuration = -1

  client.enableTelemetry(config, {
    onResponse(_url, _opts, response, durationMs) {
      capturedStatus = response.status
      capturedDuration = durationMs
    },
  })

  mockAgent
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      200,
      { access_token: 'tok', token_type: 'bearer', expires_in: 3600 },
      { headers: { 'content-type': 'application/json' } },
    )

  await client.clientCredentialsGrant(config)

  t.is(capturedStatus, 200)
  t.true(capturedDuration >= 0)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('enableTelemetry - onError is called on network failure', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)
  let capturedError: unknown

  client.enableTelemetry(config, {
    onError(_url, _opts, error) {
      capturedError = error
    },
  })

  mockAgent
    .intercept({ method: 'POST', path: '/token' })
    .replyWithError(new Error('connection refused'))

  await t.throwsAsync(client.clientCredentialsGrant(config))

  t.truthy(capturedError)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('enableTelemetry - exceptions thrown inside callbacks are swallowed', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)

  client.enableTelemetry(config, {
    onRequest() {
      throw new Error('onRequest exploded')
    },
    onResponse() {
      throw new Error('onResponse exploded')
    },
  })

  mockAgent
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      200,
      { access_token: 'tok', token_type: 'bearer', expires_in: 3600 },
      { headers: { 'content-type': 'application/json' } },
    )

  // Callback exceptions must not propagate
  await t.notThrowsAsync(client.clientCredentialsGrant(config))
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('enableTelemetry - wraps a pre-existing customFetch transparently', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = new client.Configuration(
    {
      issuer: 'https://as.example.com',
      token_endpoint: 'https://as.example.com/token',
    },
    'client-id',
    'client-secret',
  )

  let customFetchCalled = false
  // @ts-ignore
  config[client.customFetch] = (url, options) => {
    customFetchCalled = true
    return undici.fetch(url, { ...options, dispatcher: agent })
  }

  let telemetryCalled = false
  client.enableTelemetry(config, {
    onRequest() {
      telemetryCalled = true
    },
  })

  mockAgent
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      200,
      { access_token: 'tok', token_type: 'bearer', expires_in: 3600 },
      { headers: { 'content-type': 'application/json' } },
    )

  await client.clientCredentialsGrant(config)

  t.true(customFetchCalled, 'original customFetch must still be called')
  t.true(telemetryCalled, 'telemetry callback must also be called')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('enableTelemetry - repeated enablement chains callbacks', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://as.example.com')
  const config = createConfig(agent)
  const calls: string[] = []

  client.enableTelemetry(config, {
    onRequest() {
      calls.push('first')
    },
  })
  client.enableTelemetry(config, {
    onRequest() {
      calls.push('second')
    },
  })

  mockAgent
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      200,
      { access_token: 'tok', token_type: 'bearer', expires_in: 3600 },
      { headers: { 'content-type': 'application/json' } },
    )

  await client.clientCredentialsGrant(config)

  // Both first and second callbacks must fire
  t.true(calls.includes('first'))
  t.true(calls.includes('second'))
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

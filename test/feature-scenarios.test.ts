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
    .reply(401, () => {
      requestCount++
      return { error: 'expired_token' }
    })

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

test('fetchProtectedResource sets Authorization header with access token', async (t) => {
  let agent = new undici.MockAgent()
  agent.disableNetConnect()

  const mockAgent = agent.get('https://rs.example.com')
  const config = createConfig(agent)

  mockAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return (
          typeof headers['authorization'] === 'string' &&
          headers['authorization'].toLowerCase().startsWith('bearer ')
        )
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
        return (
          typeof headers['authorization'] === 'string' &&
          headers['authorization'].toLowerCase().startsWith('bearer ')
        )
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

  // Resource request must use the refreshed token
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return (
          typeof headers['authorization'] === 'string' &&
          headers['authorization'].toLowerCase().startsWith('bearer ')
        )
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

test('fetchProtectedResourceWithAutoRefresh - reactive refresh on 401', async (t) => {
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

  // First resource request returns 401
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return (
          typeof headers['authorization'] === 'string' &&
          headers['authorization'].toLowerCase().startsWith('bearer ')
        )
      },
    })
    .reply(401, '', { headers: { 'content-type': 'application/json' } })

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

  // Retry resource request with new token
  mockRsAgent
    .intercept({
      method: 'GET',
      path: '/api/resource',
      headers(headers) {
        return (
          typeof headers['authorization'] === 'string' &&
          headers['authorization'].toLowerCase().startsWith('bearer ')
        )
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
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('fetchProtectedResourceWithAutoRefresh - returns 401 when reactive refresh fails', async (t) => {
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

  // Resource request returns 401
  mockRsAgent
    .intercept({ method: 'GET', path: '/api/resource' })
    .reply(401, '', { headers: { 'content-type': 'application/json' } })

  // Reactive refresh fails with invalid_grant
  mockTokenAgent
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      400,
      { error: 'invalid_grant', error_description: 'Refresh token expired' },
      { headers: { 'content-type': 'application/json' } },
    )

  const { response, tokens: returnedTokens } =
    await client.fetchProtectedResourceWithAutoRefresh(
      config,
      tokens,
      new URL('https://rs.example.com/api/resource'),
      'GET',
    )

  // The original 401 is returned when refresh fails
  t.is(response.status, 401)
  // Token set is unchanged since refresh failed
  t.is(returnedTokens, tokens)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

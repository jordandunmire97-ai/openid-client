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

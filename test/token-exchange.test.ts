import test from 'ava'
import * as client from '../src/index.js'
import * as undici from 'undici'

const TOKEN_EXCHANGE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:token-exchange'

function makeConfig(agent: undici.MockAgent) {
  const config = new client.Configuration(
    {
      issuer: 'https://as.example.com',
      token_endpoint: 'https://as.example.com/token',
    },
    'test-client-id',
    undefined,
    client.None(),
  )

  client.allowInsecureRequests(config)
  // @ts-ignore
  config[client.customFetch] = (url: string, options: RequestInit) => {
    return undici.fetch(url, { ...options, dispatcher: agent })
  }

  return config
}

test('tokenExchangeGrant sends required parameters and returns a token response', async (t) => {
  const agent = new undici.MockAgent()
  agent.disableNetConnect()

  agent
    .get('https://as.example.com')
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      200,
      {
        access_token: 'exchanged-access-token',
        issued_token_type:
          'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
        expires_in: 3600,
      },
      { headers: { 'content-type': 'application/json' } },
    )

  const config = makeConfig(agent)

  const result = await client.tokenExchangeGrant(config, {
    subject_token: 'original-access-token',
    subject_token_type:
      'urn:ietf:params:oauth:token-type:access_token',
  })

  t.is(result.access_token, 'exchanged-access-token')
  t.is(result.token_type, 'bearer')
  t.is(result.expires_in, 3600)
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('tokenExchangeGrant accepts a response with n_a token_type', async (t) => {
  const agent = new undici.MockAgent()
  agent.disableNetConnect()

  agent
    .get('https://as.example.com')
    .intercept({ method: 'POST', path: '/token' })
    .reply(
      200,
      {
        access_token: 'exchanged-token',
        issued_token_type:
          'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'n_a',
      },
      { headers: { 'content-type': 'application/json' } },
    )

  const config = makeConfig(agent)

  const result = await client.tokenExchangeGrant(config, {
    subject_token: 'original-token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  })

  t.is(result.access_token, 'exchanged-token')
  t.is(result.token_type, 'n_a')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('tokenExchangeGrant sends optional parameters when provided', async (t) => {
  const agent = new undici.MockAgent()
  agent.disableNetConnect()

  agent
    .get('https://as.example.com')
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const params = new URLSearchParams(body as string)
        return (
          params.get('grant_type') === TOKEN_EXCHANGE_GRANT_TYPE &&
          params.get('subject_token') === 'subject-token' &&
          params.get('subject_token_type') ===
            'urn:ietf:params:oauth:token-type:access_token' &&
          params.get('actor_token') === 'actor-token' &&
          params.get('actor_token_type') ===
            'urn:ietf:params:oauth:token-type:access_token' &&
          params.get('requested_token_type') ===
            'urn:ietf:params:oauth:token-type:jwt' &&
          params.get('audience') === 'https://target.example.com' &&
          params.get('resource') === 'https://rs.example.com' &&
          params.get('scope') === 'read write'
        )
      },
    })
    .reply(
      200,
      {
        access_token: 'exchanged-token',
        token_type: 'Bearer',
      },
      { headers: { 'content-type': 'application/json' } },
    )

  const config = makeConfig(agent)

  const result = await client.tokenExchangeGrant(config, {
    subject_token: 'subject-token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    actor_token: 'actor-token',
    actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    audience: 'https://target.example.com',
    resource: 'https://rs.example.com',
    scope: 'read write',
  })

  t.is(result.access_token, 'exchanged-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('tokenExchangeGrant omits undefined optional parameters', async (t) => {
  const agent = new undici.MockAgent()
  agent.disableNetConnect()

  agent
    .get('https://as.example.com')
    .intercept({
      method: 'POST',
      path: '/token',
      body(body) {
        const params = new URLSearchParams(body as string)
        return (
          params.get('grant_type') === TOKEN_EXCHANGE_GRANT_TYPE &&
          params.get('subject_token') === 'subject-token' &&
          params.get('subject_token_type') ===
            'urn:ietf:params:oauth:token-type:access_token' &&
          !params.has('actor_token') &&
          !params.has('actor_token_type') &&
          !params.has('requested_token_type') &&
          !params.has('audience') &&
          !params.has('resource') &&
          !params.has('scope')
        )
      },
    })
    .reply(
      200,
      {
        access_token: 'exchanged-token',
        token_type: 'Bearer',
      },
      { headers: { 'content-type': 'application/json' } },
    )

  const config = makeConfig(agent)

  const result = await client.tokenExchangeGrant(config, {
    subject_token: 'subject-token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  })

  t.is(result.access_token, 'exchanged-token')
  t.notThrows(() => agent.assertNoPendingInterceptors())
})

test('tokenExchangeGrant throws when actor_token is provided without actor_token_type', async (t) => {
  const agent = new undici.MockAgent()
  agent.disableNetConnect()

  const config = makeConfig(agent)

  await t.throwsAsync(
    client.tokenExchangeGrant(config, {
      subject_token: 'subject-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: 'actor-token',
      // actor_token_type intentionally omitted
    }),
    {
      instanceOf: TypeError,
      message: /"parameters.actor_token_type" is required/,
    },
  )
})

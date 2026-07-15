import test from 'ava'
import * as client from '../src/index.js'
import * as jose from 'jose'

test('hybrid response accepts skipStateCheck', async (t) => {
  const issuer = new URL('https://as.example.com')
  const signingKeyPair = await client.randomDPoPKeyPair('ES256')
  const idToken = await new jose.SignJWT({
    nonce: 'nonce',
    c_hash: 'VpTQii5T_8rgwxA-Wtb2Bw',
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuer(issuer.href)
    .setAudience('test-client-id')
    .setSubject('subject')
    .setIssuedAt()
    .setExpirationTime('1m')
    .sign(signingKeyPair.privateKey)

  const config = new client.Configuration(
    {
      issuer: issuer.href,
      token_endpoint: `${issuer.origin}/token`,
      jwks_uri: `${issuer.origin}/jwks`,
      id_token_signing_alg_values_supported: ['ES256'],
    },
    'test-client-id',
    undefined,
    client.None(),
  )

  client.useCodeIdTokenResponseType(config)
  config[client.customFetch] = async (url) => {
    if (url.endsWith('/jwks')) {
      return new Response(
        JSON.stringify({
          keys: [await jose.exportJWK(signingKeyPair.publicKey)],
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        access_token: 'access-token',
        token_type: 'bearer',
        id_token: idToken,
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }

  const result = await client.authorizationCodeGrant(
    config,
    new URL(
      `https://rp.example.com/cb#code=code&id_token=${encodeURIComponent(idToken)}`,
    ),
    { expectedNonce: 'nonce', expectedState: client.skipStateCheck },
  )

  t.is(result.access_token, 'access-token')
})

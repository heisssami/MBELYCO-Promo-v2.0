import { setTimeout as wait } from 'node:timers/promises'
import crypto from 'node:crypto'
import Redis from 'ioredis'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const H = process.env.USSD_SIGNATURE_HEADER || 'X-Signature'
const SECRET = process.env.USSD_HMAC_SECRET || 'testsecret'
const PHONE = '+250780000000'
const SERVICE = '*123#'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

function hmac(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
}

async function post(data, headers = {}) {
  const body = new URLSearchParams(data).toString()
  const res = await fetch(`${BASE}/api/v1/ussd/handle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  })
  const text = await res.text()
  return { status: res.status, text }
}

async function waitForServer(url = `${BASE}/api/health`, retries = 120) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {}
    await wait(1000)
  }
  throw new Error('Server did not become ready')
}

function expectStartsWith(actual, expectedPrefix, label) {
  if (!actual.startsWith(expectedPrefix)) {
    throw new Error(`${label}: body must start with "${expectedPrefix}", got "${actual.slice(0, 80)}..."`)
  }
}

function expectStatus(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected status ${expected}, got ${actual}`)
}

async function run() {
  await waitForServer()

  const sessionId = '12345'
  const encPhone = encodeURIComponent(PHONE)
  const encService = encodeURIComponent(SERVICE)

  // 1) Unsigned -> 401 END Unauthorized
  {
    const { status, text } = await post({
      sessionId,
      phoneNumber: encPhone,
      serviceCode: encService,
      text: '',
    })
    expectStatus(status, 401, 'Unsigned')
    expectStartsWith(text, 'END Unauthorized', 'Unsigned body')
  }

  // 2) Bad signature -> 401 END Unauthorized
  {
    const { status, text } = await post(
      {
        sessionId,
        phoneNumber: encPhone,
        serviceCode: encService,
        text: '',
      },
      { [H]: 'deadbeef' }
    )
    expectStatus(status, 401, 'BadSig')
    expectStartsWith(text, 'END Unauthorized', 'BadSig body')
  }

  // 3) Valid signature, empty text -> 200 CON Enter promo code
  {
    const canon = `${sessionId}|${PHONE}|${SERVICE}|`
    const sig = hmac(canon)
    const { status, text } = await post(
      {
        sessionId,
        phoneNumber: encPhone,
        serviceCode: encService,
        text: '',
      },
      { [H]: sig }
    )
    expectStatus(status, 200, 'EmptyText')
    expectStartsWith(text, 'CON Enter promo code', 'EmptyText body')
  }

  // 4) Rate Limit: default 5/min; send 6 signed requests with some code
  {
    const code = process.env.TEST_USSD_CODE_ONE || 'ABCD-2512-2512-2501'
    let last
    const limit = Number(process.env.RATE_LIMIT_USSD_PER_MIN || 5)
    for (let i = 0; i < limit + 1; i++) {
      const canon = `${sessionId}|${PHONE}|${SERVICE}|${code}`
      const sig = hmac(canon)
      last = await post(
        {
          sessionId,
          phoneNumber: encPhone,
          serviceCode: encService,
          text: code,
        },
        { [H]: sig }
      )
    }
    expectStatus(last.status, 429, 'RateLimit-Excess')
    expectStartsWith(last.text, 'END Rate limit exceeded', 'RateLimit body')
  }

  // 5) Happy path with a different phone/code, and verify BullMQ job key exists
  {
    const phone2 = '+250780000001'
    const encPhone2 = encodeURIComponent(phone2)
    const code2 = process.env.TEST_USSD_CODE_TWO || 'EFGH-2512-2512-2502'
    const canon = `${sessionId}|${phone2}|${SERVICE}|${code2}`
    const sig = hmac(canon)
    const { status, text } = await post(
      {
        sessionId,
        phoneNumber: encPhone2,
        serviceCode: encService,
        text: code2,
      },
      { [H]: sig }
    )
    expectStatus(status, 200, 'HappyPath')
    expectStartsWith(text, 'END Success', 'HappyPath body')

    const redis = new Redis(REDIS_URL)
    try {
      const keys = await redis.keys('bull:disbursements:*')
      if (!keys || keys.length === 0) {
        throw new Error('BullMQ disbursement queue did not register any keys')
      }
    } finally {
      redis.disconnect()
    }
  }

  console.log('USSD verification passed')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

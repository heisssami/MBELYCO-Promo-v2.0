import crypto from 'crypto'

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function signToken(payload: Record<string, any>, expiresInSeconds = 60 * 60 * 24) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { iat: now, exp: now + expiresInSeconds, ...payload }
  const encHeader = base64url(JSON.stringify(header))
  const encPayload = base64url(JSON.stringify(body))
  const data = `${encHeader}.${encPayload}`
  const secret = process.env.AUTH_SECRET || ''
  const signature = crypto.createHmac('sha256', secret).update(data).digest()
  const encSig = base64url(signature)
  return `${data}.${encSig}`
}

export function verifyToken(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [encHeader, encPayload, encSig] = parts
  const data = `${encHeader}.${encPayload}`
  const secret = process.env.AUTH_SECRET || ''
  const expected = base64url(crypto.createHmac('sha256', secret).update(data).digest())
  if (!crypto.timingSafeEqual(Buffer.from(encSig), Buffer.from(expected))) return null
  const payloadStr = Buffer.from(encPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  try {
    const payload = JSON.parse(payloadStr)
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number' && now > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

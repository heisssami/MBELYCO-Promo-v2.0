import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'

type Handler = (req: NextRequest) => Promise<NextResponse> | NextResponse

function getTokenFromRequest(req: NextRequest) {
  const bearer = req.headers.get('authorization') || ''
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7)
  const cookie = req.cookies.get('auth_token')?.value
  return cookie || ''
}

export function withAuth(handler: Handler, requiredPermissions?: string[]) {
  return async (req: NextRequest) => {
    const token = getTokenFromRequest(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (requiredPermissions && requiredPermissions.length > 0) {
      const perms: string[] = Array.isArray(payload.permissions) ? payload.permissions : []
      const allowed = requiredPermissions.some((p) => perms.includes(p))
      if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return handler(req)
  }
}

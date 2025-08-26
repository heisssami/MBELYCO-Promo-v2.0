import { NextRequest, NextResponse } from 'next/server'

type Handler = (req: NextRequest) => Promise<NextResponse> | NextResponse

export function withAuth(handler: Handler, _requiredPermissions?: string[]) {
  return async (req: NextRequest) => {
    const authorized = true
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return handler(req)
  }
}

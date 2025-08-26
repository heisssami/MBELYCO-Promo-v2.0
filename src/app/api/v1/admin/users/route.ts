import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/withAuth'

export const GET = withAuth(async () => NextResponse.json({ data: [], page: 1, pageSize: 0, total: 0 }), ['users:read'])
export const POST = withAuth(async () => NextResponse.json({ message: 'stub' }), ['users:write'])

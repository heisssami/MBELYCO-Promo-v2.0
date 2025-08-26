import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/withAuth'

export const GET = withAuth(async () => NextResponse.json({ data: [] }), ['reports:read'])

MBELYCO Promo v2.0

Architecture
- Next.js App Router (UI + API)
- Prisma + Postgres
- Redis (BullMQ, idempotency)
- Worker service for disbursements
- Sentry, Pino

Getting started
1. Copy .env.example to .env and fill values (ensure AUTH_SECRET is set)
2. npm ci
3. npx prisma generate
4. npx prisma migrate dev --name add-password-hash
5. npm run seed
6. npm run dev
7. In another terminal: npm run worker

Default admin credentials (development only)
- email: admin@example.com
- password: ChangeMe!123
Change these immediately after first login.

Auth
- POST /api/v1/auth/login { email, password } → sets httpOnly auth_token cookie
- POST /api/v1/auth/logout → clears session cookie
- POST /api/v1/auth/refresh → rotates session cookie

API
- GET /api/health
- /api/v1/auth: login, logout, refresh
- /api/v1/admin: batches, promo-codes, users, redemptions, disbursements, reports (RBAC enforced)
- POST /api/v1/ussd/handle
- POST /api/v1/webhooks/momo
- POST /api/v1/webhooks/ussd

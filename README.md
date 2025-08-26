MBELYCO Promo v2.0

Architecture
- Next.js App Router (UI + API)
- Prisma + Postgres
- Redis (BullMQ, idempotency)
- Worker service for disbursements
- Sentry, Pino

Getting started
1. Copy .env.example to .env and fill values
2. npm ci
3. npm run db:generate
4. npm run db:migrate
5. npm run seed
6. npm run dev
7. In another terminal: npm run worker

API
- GET /api/health
- /api/v1/auth: login, logout, refresh
- /api/v1/admin: batches, promo-codes, users, redemptions, disbursements, reports
- POST /api/v1/ussd/handle
- POST /api/v1/webhooks/momo
- POST /api/v1/webhooks/ussd

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

USSD (Phase 3)
- Endpoint: POST /api/v1/ussd/handle
- Content-Type: application/x-www-form-urlencoded or application/json
- Body fields: sessionId, serviceCode, phoneNumber, text
- Response: text/plain; starts with "CON " to continue or "END " to finish
- Security:
  - Optional IP allowlist via USSD_ALLOWED_IPS="ip1,ip2"
  - Optional HMAC via USSD_HMAC_SECRET (documented, enforcement can be enabled in a later change)
- Idempotency: Redis lock redemption:&lt;code&gt;:&lt;phone&gt; to serialize attempts

Local test (form-urlencoded)
1) Start the app: npm run dev
2) Ensure you have an active promo code (npm run seed provides a few demo codes)
3) Simulate first prompt (empty text → expects "CON Enter promo code"):
   curl -X POST http://localhost:3000/api/v1/ussd/handle \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data "sessionId=12345&phoneNumber=%2B250780000000&serviceCode=*123#&text="
4) Submit a code (replace with a seeded code like ABCD-2512-2512-2501):
   curl -X POST http://localhost:3000/api/v1/ussd/handle \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data "sessionId=12345&phoneNumber=%2B250780000000&serviceCode=*123#&text=ABCD-2512-2512-2501"

API
- GET /api/health
- /api/v1/auth: login, logout, refresh
- /api/v1/admin: batches, promo-codes, users, redemptions, disbursements, reports (RBAC enforced)
- POST /api/v1/ussd/handle
- POST /api/v1/webhooks/momo
- POST /api/v1/webhooks/ussd


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

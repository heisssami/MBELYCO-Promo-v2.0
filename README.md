MBELYCO Promo v2.0

MoMo Disbursement Integration
- The worker processes BullMQ jobs from the "disbursements" queue.
- Default behavior is simulation: if MoMo credentials are not provided, the worker marks disbursements as success and updates redemptions to disbursed.
- When the following environment variables are set, the worker uses MTN MoMo sandbox APIs:
  - MOMO_BASE_URL
  - MOMO_API_USER
  - MOMO_API_KEY
  - MOMO_SUBSCRIPTION_KEY
  - MOMO_TARGET_ENV
  - MOMO_CALLBACK_URL
- Webhook endpoint: POST /api/v1/webhooks/momo
  - Headers: Ocp-Apim-Subscription-Key must match MOMO_SUBSCRIPTION_KEY if set
  - Optional: IP allowlist via MOMO_ALLOWED_IPS (comma-separated)
  - Body example:
    { "externalId": "MBELYCO-<redemptionId>", "financialTransactionId": "sandbox-12345" }
  - Idempotent: multiple deliveries with the same reference do not double-process.

Local & CI
- Start app: npm run build && npm start
- Start worker: npm run worker
- CI runs two integration tests:
  - scripts/test-worker.mjs: verifies simulation path end-to-end
  - scripts/test-webhook-momo.mjs: verifies webhook idempotency


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
  - IP allowlist via USSD_ALLOWED_IPS="ip1,ip2" (uses x-forwarded-for/x-real-ip)
  - HMAC verification enforced when USSD_HMAC_SECRET is set
    - Header: defaults to X-Signature (can be overridden via USSD_SIGNATURE_HEADER). Aliases also accepted: X-AT-Signature, X-USSD-Signature
    - Algorithm: HMAC-SHA256
    - Canonical string: "sessionId|phoneNumber|serviceCode|text" (empty strings for missing fields)
- Rate limiting: 5 requests per minute per phone number (override via RATE_LIMIT_USSD_PER_MIN). Falls back to IP if phone is missing.
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

Note: When USSD_HMAC_SECRET is set, include the signature header. Example (pseudo):
  SIG=$(echo -n "12345|+250780000000|*123#|ABCD-2512-2512-2501" | openssl dgst -sha256 -hmac "$USSD_HMAC_SECRET" -hex | cut -d" " -f2)
  curl -X POST http://localhost:3000/api/v1/ussd/handle \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "${USSD_SIGNATURE_HEADER:-X-Signature}: $SIG" \
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

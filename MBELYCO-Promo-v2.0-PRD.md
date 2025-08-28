# MBELYCO Promo v2.0 - Spec-Driven Product Requirements Document

## Executive Summary

**Product**: MBELYCO Promo v2.0  
**Company**: MBELYCO Paints  
**Version**: 2.0

### Problem Statement (v1.0 Pain Points)
- **No audit trail** for tracking stolen promo codes
- **Manual code validation and disbursement** processes
- **Idempotency issues** allowing double redemptions
- **Inefficient operations** with no automated workflows

### Solution Overview
MBELYCO Promo v2.0 is a production-grade, full-stack web application that provides:
- **Secure, auditable promo code lifecycle** with batch tracking
- **Automated USSD redemption** via Africa's Talking API
- **Automated disbursements** via MTN MoMo integration
- **Real-time monitoring and reporting** with comprehensive audit trails
- **Scalable, modular architecture** built with Next.js

## 1. Technology Stack

### Frontend
- Next.js 14+ with App Router
- TypeScript 5.0+
- Tailwind CSS + Shadcn/UI
- Zustand for state management
- React Hook Form + Zod validation

### Backend
- Next.js API Routes (TypeScript)
- Prisma ORM with PostgreSQL
- BetterAuth for authentication
- BullMQ for background jobs
- Redis for caching and sessions

### Database
- Neon PostgreSQL (primary)
- Redis (caching, sessions, queues)

### Infrastructure
- Vercel (deployment)
- CloudFlare (CDN, security)
- Sentry (monitoring)
- GitHub Actions (CI/CD)

## 2. Core Data Models

### Database Schema

#### Users & Authentication
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role_id INTEGER REFERENCES user_roles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES user_roles(id),
  permission_id INTEGER REFERENCES permissions(id),
  UNIQUE(role_id, permission_id)
);
```

#### Core Business Tables
```sql
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  batch_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  total_codes INTEGER NOT NULL,
  amount_per_code DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RWF',
  status VARCHAR(20) DEFAULT 'active',
  created_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  batch_id INTEGER REFERENCES batches(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RWF',
  status VARCHAR(30) DEFAULT 'active',
  is_reported BOOLEAN DEFAULT false,
  reported_at TIMESTAMP,
  reported_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE redemptions (
  id SERIAL PRIMARY KEY,
  promo_code_id INTEGER REFERENCES promo_codes(id),
  user_id INTEGER REFERENCES users(id),
  phone_number VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RWF',
  status VARCHAR(30) DEFAULT 'initiated',
  momo_transaction_id VARCHAR(100),
  momo_reference VARCHAR(100),
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disbursed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE disbursements (
  id SERIAL PRIMARY KEY,
  redemption_id INTEGER REFERENCES redemptions(id),
  momo_transaction_id VARCHAR(100) UNIQUE,
  momo_reference VARCHAR(100) UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RWF',
  status VARCHAR(30) DEFAULT 'pending',
  phone_number VARCHAR(20) NOT NULL,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 3. Core Business Logic

### Promo Code Generation
```typescript
export class PromoCodeGenerator {
  static generateCode(createdAt: Date): string {
    const random = (length: number): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return Array.from({ length }, () => 
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    };
    
    const YY = createdAt.getFullYear().toString().slice(-2);
    const MM = String(createdAt.getMonth() + 1).padStart(2, '0');
    const DD = String(createdAt.getDate()).padStart(2, '0');
    
    return `${random(4)}-${random(2)}${YY}-${random(2)}${MM}-${random(2)}${DD}`;
  }
}
```

### Idempotency Service
```typescript
export class IdempotencyService {
  async checkIdempotency(code: string, phoneNumber: string): Promise<boolean> {
    const key = `redemption:${code}:${phoneNumber}`;
    const exists = await this.redis.exists(key);
    
    if (exists) return false; // Already redeemed
    
    await this.redis.setex(key, 300, '1'); // 5 minutes TTL
    return true;
  }
}
```

### USSD Service
```typescript
export class USSDService {
  async handleUSSDRequest(params: USSDRequest): Promise<USSDResponse> {
    const { phoneNumber, text } = params;
    
    // Auto-register user if not exists
    let user = await this.getOrCreateUser(phoneNumber);
    
    // Parse USSD input
    const input = text ? text.split('*').pop() : '';
    
    if (!input) return this.showMainMenu();
    
    // Handle code redemption
    if (input.length >= 19) {
      return await this.handleCodeRedemption(input, phoneNumber, user);
    }
    
    return this.handleMenuNavigation(input, phoneNumber);
  }
  
  private async handleCodeRedemption(code: string, phoneNumber: string, user: User): Promise<USSDResponse> {
    // Check idempotency
    const canRedeem = await this.idempotencyService.checkIdempotency(code, phoneNumber);
    if (!canRedeem) {
      return { response: "END Code has already been redeemed.", status: "END" };
    }
    
    try {
      const redemption = await this.promoCodeService.redeemCode(code, phoneNumber, user.id);
      await this.queueDisbursement(redemption);
      
      return {
        response: `END Success! ${redemption.amount} RWF will be sent to your MoMo wallet shortly.`,
        status: "END"
      };
    } catch (error) {
      await this.idempotencyService.releaseIdempotency(code, phoneNumber);
      
      if (error.code === 'CODE_NOT_FOUND') {
        return { response: "END Invalid code. Please check and try again.", status: "END" };
      }
      if (error.code === 'CODE_EXPIRED') {
        return { response: "END This promotion has expired.", status: "END" };
      }
      if (error.code === 'CODE_ALREADY_REDEEMED') {
        return { response: "END Code has already been redeemed.", status: "END" };
      }
      
      return { response: "END System error. Please try again later.", status: "END" };
    }
  }
}
```

## 4. API Design

### REST API Structure
```
/api/v1/
├── auth/          # Authentication endpoints
├── admin/         # Admin panel endpoints
│   ├── batches
│   ├── promo-codes
│   ├── redemptions
│   ├── disbursements
│   ├── users
│   └── reports
├── ussd/          # USSD handling
└── webhooks/      # External webhooks
    ├── momo
    └── ussd
```

### Key API Endpoints
```typescript
// Authentication
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh

// Batch Management
GET    /api/v1/admin/batches
POST   /api/v1/admin/batches
GET    /api/v1/admin/batches/{id}
PUT    /api/v1/admin/batches/{id}

// Promo Code Management
GET    /api/v1/admin/promo-codes
POST   /api/v1/admin/promo-codes/generate
POST   /api/v1/admin/promo-codes/import
PUT    /api/v1/admin/promo-codes/{id}/disable
GET    /api/v1/admin/promo-codes/export

// USSD Endpoint
POST   /api/v1/ussd/handle

// Webhooks
POST   /api/v1/webhooks/momo/disbursements
POST   /api/v1/webhooks/ussd/status
```

## 5. Security & Authentication

### Authentication Strategy
```typescript
export const auth = new BetterAuth({
  providers: [
    {
      id: "credentials",
      type: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => {
        return await validateUser(credentials);
      }
    }
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    }
  }
});
```

### Authorization Middleware
```typescript
export function withAuth(handler: NextApiHandler, requiredPermissions?: string[]) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authConfig);
    
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (requiredPermissions) {
      const hasPermission = requiredPermissions.some(permission => 
        session.user.permissions.includes(permission)
      );
      
      if (!hasPermission) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
    }
    
    return handler(req, res);
  };
}
```

## 6. Background Job Processing

### Disbursement Queue
```typescript
export const disbursementQueue = new Queue("disbursements", {
  connection: redis
});

const disbursementWorker = new Worker("disbursements", async (job) => {
  const { redemptionId } = job.data;
  
  try {
    const redemption = await prisma.redemption.findUnique({
      where: { id: redemptionId },
      include: { promoCode: true, user: true }
    });
    
    if (!redemption) throw new Error("Redemption not found");
    
    // Process MoMo disbursement
    const disbursement = await momoService.disburse({
      amount: redemption.amount,
      phoneNumber: redemption.phoneNumber,
      reference: `MBELYCO-${redemption.id}`,
      description: "MBELYCO Promo Code Redemption"
    });
    
    // Update redemption status
    await prisma.redemption.update({
      where: { id: redemptionId },
      data: {
        status: "disbursed",
        momoTransactionId: disbursement.transactionId,
        momoReference: disbursement.reference,
        disbursedAt: new Date()
      }
    });
    
    // Log audit trail
    await auditService.log({
      action: "disbursement_success",
      entityType: "redemption",
      entityId: redemptionId,
      userId: redemption.userId
    });
    
  } catch (error) {
    if (job.attemptsMade < 3) throw error; // Will retry
    
    // Mark as failed after max retries
    await prisma.redemption.update({
      where: { id: redemptionId },
      data: { status: "failed" }
    });
    
    // Send alert to admin
    await alertService.sendDisbursementFailureAlert(redemptionId, error.message);
  }
}, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  }
});
```

## 7. Monitoring & Observability

### Logging Strategy
```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: { target: "pino-pretty", options: { colorize: true } }
});

export const auditLogger = pino({
  level: "info",
  transport: { target: "pino/file", options: { destination: "./logs/audit.log" } }
});
```

### Metrics Collection
```typescript
export const metrics = {
  redemptionAttempts: new Counter({
    name: "redemption_attempts_total",
    help: "Total number of redemption attempts",
    labelNames: ["status"]
  }),
  
  disbursementDuration: new Histogram({
    name: "disbursement_duration_seconds",
    help: "Time taken for disbursement processing",
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),
  
  activeRedemptions: new Gauge({
    name: "active_redemptions",
    help: "Number of active redemptions"
  })
};
```

## 8. Testing Strategy

### Unit Tests
```typescript
describe("PromoCodeService", () => {
  describe("redeemCode", () => {
    it("should successfully redeem a valid code", async () => {
      const mockCode = "ABCD-12YY-34MM-56DD";
      const mockPhoneNumber = "+250781234567";
      
      const result = await service.redeemCode(mockCode, mockPhoneNumber, 1);
      
      expect(result.status).toBe("redeemed");
      expect(result.amount).toBe(1000);
    });
    
    it("should prevent double redemption", async () => {
      const mockCode = "ABCD-12YY-34MM-56DD";
      const mockPhoneNumber = "+250781234567";
      
      // First redemption
      await service.redeemCode(mockCode, mockPhoneNumber, 1);
      
      // Second redemption should fail
      await expect(
        service.redeemCode(mockCode, mockPhoneNumber, 1)
      ).rejects.toThrow("Code already redeemed");
    });
  });
});
```

### Integration Tests
```typescript
describe("/api/v1/ussd/handle", () => {
  it("should handle valid code redemption", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        sessionId: "1234567890",
        phoneNumber: "+250781234567",
        serviceCode: "*123#",
        text: "ABCD-12YY-34MM-56DD"
      }
    });
    
    await ussdHandler(req, res);
    
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toContain("Success");
  });
});
```

## 9. Deployment & DevOps

### Environment Configuration
```env
# Database
DATABASE_URL="postgresql://user:pass@host:port/db"
REDIS_URL="redis://localhost:6379"

# Authentication
AUTH_SECRET="your-super-secret-key"
NEXTAUTH_URL="https://your-domain.com"

# USSD Integration
USSD_HMAC_SECRET="your-ussd-hmac-secret"
USSD_ALLOWED_IPS="192.168.1.1,192.168.1.2"

# MoMo Integration
MOMO_BASE_URL="https://sandbox.momodeveloper.mtn.com"
MOMO_API_USER="your-api-user"
MOMO_API_KEY="your-api-key"
MOMO_SUBSCRIPTION_KEY="your-subscription-key"
MOMO_TARGET_ENV="sandbox"

# Monitoring
SENTRY_DSN="your-sentry-dsn"
```

### Docker Configuration
```dockerfile
FROM node:18-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

## 10. Implementation Timeline

### Phase 1: Foundation
- [ ] Project setup with Next.js 14+ and TypeScript
- [ ] Database schema design and Prisma setup
- [ ] Authentication system with BetterAuth
- [ ] Basic admin interface with Shadcn/UI
- [ ] User management and role-based access control

### Phase 2: Core Features
- [ ] Batch management system
- [ ] Promo code generation with audit trail
- [ ] USSD integration with Africa's Talking
- [ ] Basic redemption flow with idempotency
- [ ] Real-time monitoring dashboard

### Phase 3: Payment Integration
- [ ] MTN MoMo integration for disbursements
- [ ] Background job processing with BullMQ
- [ ] Webhook handling for payment status
- [ ] Retry mechanisms and error handling
- [ ] Transaction reconciliation

### Phase 4: Advanced Features
- [ ] Comprehensive reporting and analytics
- [ ] Export capabilities (CSV, PDF)
- [ ] Advanced audit logging
- [ ] Performance optimization
- [ ] Security hardening

### Phase 5: Production Readiness
- [ ] Load testing and performance tuning
- [ ] Security audit and penetration testing
- [ ] Documentation and user guides
- [ ] Deployment automation
- [ ] Monitoring and alerting setup

### Phase 6: Launch
- [ ] Staging environment testing
- [ ] Production deployment
- [ ] Go-live support and monitoring
- [ ] User training and onboarding

## 11. Success Metrics & KPIs

### Technical KPIs
- **System Uptime**: 99.9% availability
- **API Response Time**: < 200ms for admin operations, < 5s for USSD
- **Error Rate**: < 0.1% for critical operations
- **Throughput**: 1000+ redemptions per minute

### Business KPIs
- **Redemption Success Rate**: > 95%
- **Disbursement Success Rate**: > 98%
- **Fraud Prevention**: 100% audit trail coverage
- **Customer Satisfaction**: > 4.5/5 rating

### Operational KPIs
- **Support Response Time**: < 2 hours
- **Bug Resolution Time**: < 24 hours
- **Feature Delivery**: 2-week sprint cycles
- **Security Incidents**: 0 per quarter

## 12. Risk Mitigation

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Database downtime | Medium | High | Multi-region backup, failover |
| USSD aggregator failure | Medium | High | Multiple aggregators, fallback |
| MoMo API outages | High | High | Retry logic, manual processing |
| Concurrent redemption conflicts | High | Medium | Database locking, idempotency |

### Business Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Code generation collisions | Low | Medium | Retry logic, longer codes |
| Double disbursements | Medium | High | Idempotency keys, reconciliation |
| Security breaches | Low | High | Regular audits, penetration testing |
| Regulatory changes | Medium | Medium | Flexible configuration, compliance monitoring |

## 13. Conclusion

MBELYCO Promo v2.0 addresses all critical pain points from v1.0 while providing a robust, scalable, and secure platform for promo code management. The solution leverages modern technologies and best practices to ensure production readiness and long-term maintainability.

Key improvements over v1.0:
- ✅ **Complete audit trail** for all operations
- ✅ **Automated USSD redemption** with idempotency
- ✅ **Automated disbursements** via MTN MoMo
- ✅ **Real-time monitoring** and comprehensive reporting
- ✅ **Scalable architecture** built for growth
- ✅ **Security-first approach** with proper authentication and authorization

This spec-driven PRD provides a comprehensive roadmap for building a production-ready MBELYCO Promo v2.0 system that will significantly improve operational efficiency, security, and user experience.
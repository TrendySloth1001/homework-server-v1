# 🚀 Quick Start: Production Deployment

## ⚡ 30-Minute Production Setup

### Step 1: Security Essentials (10 min)

```bash
# Install security packages
npm install jsonwebtoken bcryptjs express-rate-limit helmet express-validator morgan compression

# Install monitoring
npm install winston @sentry/node
```

**Create auth middleware:**
```bash
# Copy and paste into terminal
cat > src/shared/middleware/auth.ts << 'EOF'
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../lib/errors';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: 'student' | 'teacher' | 'admin';
    email: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    throw new UnauthorizedError('No token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    next();
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
};

export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new UnauthorizedError('Insufficient permissions');
    }
    next();
  };
};
EOF
```

**Create rate limiter:**
```bash
cat > src/shared/middleware/rateLimiter.ts << 'EOF'
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
});

export const gradingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many submissions. Please slow down.',
});
EOF
```

**Update server.ts:**
```typescript
// Add at top of src/server.ts
import helmet from 'helmet';
import compression from 'compression';
import { apiLimiter } from './shared/middleware/rateLimiter';

// Add after CORS
app.use(helmet());
app.use(compression());
app.use('/api', apiLimiter);
```

### Step 2: Environment Variables (5 min)

```bash
# Create production .env
cp .env .env.production

# Edit .env.production
NODE_ENV=production
PORT=3001
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
DATABASE_URL="postgresql://user:pass@host:5432/homework_prod"
REDIS_URL="redis://redis:6379"
LOG_LEVEL=error
```

### Step 3: Docker Setup (10 min)

**Create production Dockerfile:**
```dockerfile
# Dockerfile.production
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
EXPOSE 3001
CMD ["npm", "start"]
```

**Create docker-compose.production.yml:**
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.production
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:password@postgres:5432/homework
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    
  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:-password}
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

**Build and run:**
```bash
docker-compose -f docker-compose.production.yml up -d
```

### Step 4: Health Checks (5 min)

**Add to src/server.ts:**
```typescript
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    status: 'OK',
    services: { database: 'unknown', redis: 'unknown' }
  };
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
  } catch (error) {
    health.services.database = 'unhealthy';
    health.status = 'DEGRADED';
  }
  
  res.status(health.status === 'OK' ? 200 : 503).json(health);
});
```

**Test:**
```bash
curl http://localhost:3001/health
```

---

## 🎯 Apply Auth to Routes (5 min)

**Update assessment routes:**
```typescript
// src/features/assessment/assessment.routes.ts
import { authenticateToken, authorizeRoles } from '../../shared/middleware/auth';
import { gradingLimiter } from '../../shared/middleware/rateLimiter';

// Protect endpoints
router.post('/grade', 
  authenticateToken, 
  authorizeRoles('student', 'teacher'), 
  gradingLimiter,
  gradeAnswerHandler
);

router.get('/stats/:teacherId', 
  authenticateToken,
  authorizeRoles('teacher', 'admin'),
  getAssessmentStatsHandler
);

// All other routes need auth too
router.use(authenticateToken);
```

---

## ✅ Deployment Checklist

### Pre-Deploy:
- [ ] Run `npm run build` successfully
- [ ] Run `npx tsc --noEmit` (no errors)
- [ ] Test health endpoint locally
- [ ] Verify database connection
- [ ] Check Redis connection
- [ ] Review .env.production (no secrets in code)

### Deploy:
- [ ] Build Docker image: `docker build -f Dockerfile.production -t homework-api:latest .`
- [ ] Run migrations: `docker exec homework-app npx prisma migrate deploy`
- [ ] Test health endpoint: `curl https://api.yourdomain.com/health`
- [ ] Monitor logs: `docker logs -f homework-app`

### Post-Deploy:
- [ ] Set up monitoring (Sentry)
- [ ] Configure backups (database)
- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Configure domain DNS
- [ ] Test all endpoints with Postman
- [ ] Monitor error rates
- [ ] Set up alerts (downtime, errors)

---

## 🔥 Emergency Rollback

```bash
# Stop current containers
docker-compose -f docker-compose.production.yml down

# Revert to previous version
docker pull homework-api:previous
docker tag homework-api:previous homework-api:latest

# Restart
docker-compose -f docker-compose.production.yml up -d
```

---

## 📊 Monitoring Commands

```bash
# View logs
docker logs -f homework-app

# Check resource usage
docker stats

# Database connections
docker exec homework-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Redis info
docker exec homework-redis redis-cli info stats

# Health check
watch -n 5 'curl -s http://localhost:3001/health | jq'
```

---

## 🚨 Common Issues

### Issue: Database connection timeout
**Fix:**
```bash
# Increase connection pool
DATABASE_URL="postgresql://user:pass@host:5432/homework?connection_limit=20&pool_timeout=10"
```

### Issue: Out of memory
**Fix:**
```yaml
# docker-compose.production.yml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Issue: Rate limit too strict
**Fix:**
```typescript
// Increase limits in rateLimiter.ts
export const apiLimiter = rateLimit({
  max: 200, // Increase from 100
});
```

---

## 🎉 Success Metrics

After deployment, monitor:
- ✅ Uptime > 99%
- ✅ Response time < 200ms (p95)
- ✅ Error rate < 0.1%
- ✅ Database connections < 50% pool
- ✅ Memory usage < 80%
- ✅ CPU usage < 70%

---

## 📞 Support

If issues persist:
1. Check logs: `docker logs homework-app`
2. Review health: `curl /health`
3. Test database: `docker exec homework-postgres psql -U postgres`
4. Check Redis: `docker exec homework-redis redis-cli ping`

---

**Production ready in 30 minutes! 🚀**

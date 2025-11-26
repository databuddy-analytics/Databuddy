# Deployment Guide

This guide covers deploying Databuddy for production use, including self-hosting and cloud deployment options.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Self-Hosting](#self-hosting)
- [Cloud Deployment](#cloud-deployment)
- [Production Checklist](#production-checklist)
- [Scaling & Performance](#scaling--performance)
- [Monitoring & Maintenance](#monitoring--maintenance)

## Prerequisites

### System Requirements

**Minimum Requirements:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 20GB SSD
- OS: Linux (Ubuntu 20.04+ recommended)

**Recommended for Production:**
- CPU: 4+ cores
- RAM: 8GB+
- Storage: 50GB+ SSD
- OS: Linux (Ubuntu 22.04 LTS)

### Required Services

- **PostgreSQL** 14+ (for application data)
- **ClickHouse** 23+ (for analytics data)
- **Redis** 7+ (for caching and sessions)
- **Node.js** 20+ or **Bun** 1.2+ (runtime)

## Environment Configuration

### Production Environment Variables

Create a `.env.production` file with the following variables:

```bash
# Application
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/databuddy
DATABASE_POOL_SIZE=20
DATABASE_SSL=true

# ClickHouse (Analytics)
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DATABASE=databuddy_analytics
CLICKHOUSE_PROTOCOL=https

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# Authentication
NEXTAUTH_URL=https://app.yourdomain.com
NEXTAUTH_SECRET=your_secret_key_here_minimum_32_chars

# Email (for transactional emails)
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM=noreply@yourdomain.com

# Analytics Collection
NEXT_PUBLIC_DATABUDDY_CLIENT_ID=your_client_id

# API Configuration
API_RATE_LIMIT=100
API_RATE_LIMIT_WINDOW=60000

# Security
SESSION_SECRET=your_session_secret_here
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# Optional: Cloud Storage (for exports)
S3_BUCKET=databuddy-exports
S3_REGION=us-east-1
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
```

### Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong, unique secrets** for all keys (minimum 32 characters)
3. **Enable SSL/TLS** for all database connections
4. **Rotate secrets regularly** (every 90 days recommended)
5. **Use environment-specific credentials** (don't reuse dev credentials in production)

## Docker Deployment

### Using Docker Compose (Recommended)

**1. Create a production docker-compose file:**

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: databuddy-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: databuddy
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: databuddy
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U databuddy"]
      interval: 10s
      timeout: 5s
      retries: 5

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    container_name: databuddy-clickhouse
    restart: unless-stopped
    environment:
      CLICKHOUSE_USER: databuddy
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DB: databuddy_analytics
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./clickhouse-config.xml:/etc/clickhouse-server/config.d/config.xml
    ports:
      - "8123:8123"
      - "9000:9000"
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  redis:
    image: redis:7-alpine
    container_name: databuddy-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
    container_name: databuddy-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      clickhouse:
        condition: service_started
      redis:
        condition: service_started
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - CLICKHOUSE_HOST=clickhouse
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env.production
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

volumes:
  postgres_data:
  clickhouse_data:
  redis_data:

networks:
  default:
    name: databuddy-network
```

**2. Deploy the stack:**

```bash
# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Initialize databases
docker-compose -f docker-compose.prod.yml exec app bun run db:push
docker-compose -f docker-compose.prod.yml exec app bun run clickhouse:init
```

**3. Set up automatic backups:**

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/databuddy"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker exec databuddy-postgres pg_dump -U databuddy databuddy | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

# Backup ClickHouse
docker exec databuddy-clickhouse clickhouse-client --query "BACKUP DATABASE databuddy_analytics TO Disk('backups', '$DATE')"

# Retain only last 7 days of backups
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
EOF

chmod +x backup.sh

# Add to crontab for daily backups at 2 AM
echo "0 2 * * * /path/to/backup.sh" | crontab -
```

## Self-Hosting

### Manual Installation

**1. Install dependencies:**

```bash
# Install Bun (recommended)
curl -fsSL https://bun.sh/install | bash

# Or use Node.js 20+
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt-get install -y nodejs
```

**2. Clone and build:**

```bash
git clone https://github.com/databuddy-analytics/Databuddy.git
cd Databuddy
bun install
bun run build
```

**3. Set up databases:**

```bash
# Install PostgreSQL
sudo apt-get install postgresql-14

# Install ClickHouse
sudo apt-get install -y apt-transport-https ca-certificates dirmngr
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 8919F6BD2B48D754
echo "deb https://packages.clickhouse.com/deb stable main" | sudo tee /etc/apt/sources.list.d/clickhouse.list
sudo apt-get update
sudo apt-get install -y clickhouse-server clickhouse-client

# Install Redis
sudo apt-get install redis-server
```

**4. Initialize databases:**

```bash
# Configure environment
cp .env.example .env.production
# Edit .env.production with your settings

# Run migrations
bun run db:push
bun run clickhouse:init
```

**5. Start the application:**

```bash
# Using PM2 (recommended for process management)
npm install -g pm2
pm2 start ecosystem.config.js --env production

# Or using Bun directly
bun run start
```

**6. Set up reverse proxy (Nginx):**

```nginx
# /etc/nginx/sites-available/databuddy
server {
    listen 80;
    server_name app.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site and restart Nginx
sudo ln -s /etc/nginx/sites-available/databuddy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Cloud Deployment

### Vercel (Application)

**1. Install Vercel CLI:**

```bash
npm install -g vercel
```

**2. Configure vercel.json:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "buildCommand": "bun run build",
  "installCommand": "bun install"
}
```

**3. Deploy:**

```bash
# Deploy to production
vercel --prod

# Set environment variables
vercel env add DATABASE_URL production
vercel env add CLICKHOUSE_HOST production
# ... add all required env vars
```

### AWS (Full Stack)

**Services Required:**
- **RDS** (PostgreSQL)
- **ElastiCache** (Redis)
- **EC2** or **ECS** (Application)
- **S3** (Static assets & exports)
- **CloudFront** (CDN)

**Deployment using Terraform:**

```hcl
# Example Terraform configuration
# See /infrastructure/aws/ for complete setup
```

### DigitalOcean (App Platform)

```yaml
# .do/app.yaml
name: databuddy
services:
  - name: web
    github:
      repo: your-username/databuddy
      branch: main
      deploy_on_push: true
    build_command: bun run build
    run_command: bun run start
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        scope: RUN_TIME
        type: SECRET
    instance_count: 2
    instance_size_slug: professional-xs
    http_port: 3000

databases:
  - name: postgres
    engine: PG
    version: "14"
    size: db-s-1vcpu-1gb
  - name: redis
    engine: REDIS
    version: "7"
```

## Production Checklist

Before deploying to production, ensure:

### Security
- [ ] All secrets use strong, unique values
- [ ] SSL/TLS enabled for all connections
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] CSP (Content Security Policy) configured

### Database
- [ ] Database backups configured
- [ ] Connection pooling configured
- [ ] Indexes created for performance
- [ ] Database monitoring enabled

### Application
- [ ] Environment variables set correctly
- [ ] Error tracking configured (e.g., Sentry)
- [ ] Logging configured
- [ ] Health checks implemented
- [ ] Build optimized for production

### Performance
- [ ] CDN configured for static assets
- [ ] Image optimization enabled
- [ ] Caching strategy implemented
- [ ] Database query optimization

### Monitoring
- [ ] Uptime monitoring configured
- [ ] Performance monitoring enabled
- [ ] Log aggregation set up
- [ ] Alerting configured

## Scaling & Performance

### Horizontal Scaling

**Application Layer:**
```bash
# Using Docker Compose scale
docker-compose -f docker-compose.prod.yml up -d --scale app=3

# Using Kubernetes
kubectl scale deployment databuddy-app --replicas=3
```

**Database Scaling:**
- **PostgreSQL**: Use read replicas for analytics queries
- **ClickHouse**: Implement distributed tables and sharding
- **Redis**: Use Redis Cluster for horizontal scaling

### Vertical Scaling

Monitor these metrics to determine when to scale:
- CPU usage > 70% sustained
- Memory usage > 80%
- Database connection pool saturation
- Response time degradation

### Caching Strategy

```typescript
// Implement Redis caching for expensive queries
import { redis } from '@/lib/redis'

async function getAnalytics(websiteId: string, dateRange: DateRange) {
  const cacheKey = `analytics:${websiteId}:${dateRange.start}:${dateRange.end}`

  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // Fetch from database
  const data = await fetchAnalyticsData(websiteId, dateRange)

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(data))

  return data
}
```

## Monitoring & Maintenance

### Health Checks

Implement comprehensive health checks:

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    clickhouse: await checkClickhouse(),
    redis: await checkRedis(),
    timestamp: new Date().toISOString()
  }

  const allHealthy = Object.values(checks).every(c => c.healthy)

  return Response.json(checks, {
    status: allHealthy ? 200 : 503
  })
}
```

### Log Management

**Using PM2:**
```bash
# View logs
pm2 logs databuddy

# Log rotation configuration
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### Database Maintenance

**Regular maintenance tasks:**

```bash
# PostgreSQL vacuum and analyze (weekly)
psql -U databuddy -d databuddy -c "VACUUM ANALYZE;"

# ClickHouse optimize tables (daily)
clickhouse-client --query "OPTIMIZE TABLE analytics_events FINAL;"

# Check database sizes
psql -U databuddy -d databuddy -c "SELECT pg_size_pretty(pg_database_size('databuddy'));"
```

### Update Strategy

**Zero-downtime deployment:**

1. Build new version
2. Run database migrations
3. Deploy to canary instances
4. Monitor for errors
5. Gradually roll out to all instances
6. Rollback if issues detected

```bash
# Using PM2 for zero-downtime
pm2 reload ecosystem.config.js --env production
```

## Troubleshooting

### Common Issues

**Issue: High memory usage**
- Check for memory leaks in application code
- Increase connection pool size if needed
- Consider horizontal scaling

**Issue: Slow queries**
- Enable query logging
- Add database indexes
- Implement query caching
- Use read replicas for analytics

**Issue: Connection timeouts**
- Increase connection pool size
- Check network connectivity
- Verify firewall rules
- Monitor database connection limits

### Support

For deployment issues:
- [Documentation](https://www.databuddy.cc/docs)
- [Discord Community](https://discord.gg/JTk7a38tCZ)
- [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues)
- [Email Support](mailto:support@databuddy.cc)

---

**Need help with deployment?** Our team can assist with enterprise deployments, scaling, and optimization. Contact us at [enterprise@databuddy.cc](mailto:enterprise@databuddy.cc).

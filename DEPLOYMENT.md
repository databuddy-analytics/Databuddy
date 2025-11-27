# Deployment Guide

This guide covers deploying Databuddy to production environments, including self-hosted and cloud deployments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Options](#deployment-options)
  - [Docker Compose (Recommended for Self-Hosting)](#docker-compose-recommended-for-self-hosting)
  - [Kubernetes](#kubernetes)
  - [Cloud Platforms](#cloud-platforms)
- [Database Setup](#database-setup)
- [Service Configuration](#service-configuration)
- [Security Checklist](#security-checklist)
- [Monitoring & Logging](#monitoring--logging)
- [Scaling Considerations](#scaling-considerations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum Requirements** (for small deployments):
- 2 CPU cores
- 4 GB RAM
- 20 GB storage
- Ubuntu 22.04 LTS or similar Linux distribution

**Recommended Requirements** (for production):
- 4+ CPU cores
- 8+ GB RAM
- 100+ GB SSD storage
- Ubuntu 22.04 LTS or similar

### Software Requirements

- **Docker**: 24.0+ and Docker Compose 2.20+
- **Bun**: 1.2.19+ (if building from source)
- **PostgreSQL**: 17+
- **ClickHouse**: 25.5+
- **Redis**: 7+

### Domain & DNS

- Domain name configured with DNS A records
- SSL/TLS certificate (Let's Encrypt recommended)
- Subdomains (optional but recommended):
  - `app.yourdomain.com` - Dashboard
  - `api.yourdomain.com` - API Server
  - `collect.yourdomain.com` - Basket (Analytics Collection)

## Environment Configuration

### 1. Create Environment File

Copy the example environment file and configure for production:

```bash
cp .env.example .env
```

### 2. Required Environment Variables

**Database Connections**:
```env
# PostgreSQL - User data, authentication
DATABASE_URL="postgres://username:password@postgres-host:5432/databuddy"

# ClickHouse - Analytics data
CLICKHOUSE_URL="http://username:password@clickhouse-host:8123/databuddy_analytics"

# Redis - Caching and sessions
REDIS_URL="redis://redis-host:6379"
```

**Authentication**:
```env
# Better Auth configuration
BETTER_AUTH_URL="https://app.yourdomain.com"
BETTER_AUTH_SECRET="<generate-secure-random-string-min-32-chars>"

# Generate secure secret:
# openssl rand -base64 32
```

**Application**:
```env
# IMPORTANT: Set to production
NODE_ENV=production

# API URL for frontend
NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
```

### 3. Optional Environment Variables

**OAuth Providers** (if using social login):
```env
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"

GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

**Email Service** (Resend):
```env
RESEND_API_KEY="re_your_api_key"
RESEND_AUDIENCE_ID="your_audience_id"
```

**Object Storage** (Cloudflare R2 for images/exports):
```env
R2_ACCESS_KEY_ID="your_access_key"
R2_SECRET_ACCESS_KEY="your_secret_key"
R2_BUCKET="your_bucket_name"
R2_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"
```

**Rate Limiting** (Autumn.js):
```env
AUTUMN_SECRET_KEY="your_autumn_secret_key"
```

**Logging** (Logtail/Axiom):
```env
LOGTAIL_SOURCE_TOKEN="your_source_token"
LOGTAIL_ENDPOINT="https://in.logtail.com"
```

**AI Assistant** (optional):
```env
AI_API_KEY="your_openrouter_api_key"
```

### 4. Generate Secure Secrets

```bash
# Generate BETTER_AUTH_SECRET
openssl rand -base64 32

# Generate AUTUMN_SECRET_KEY
openssl rand -hex 32
```

## Deployment Options

### Docker Compose (Recommended for Self-Hosting)

This is the easiest way to deploy Databuddy with all services included.

#### 1. Clone Repository

```bash
git clone https://github.com/databuddy-analytics/Databuddy.git
cd Databuddy
```

#### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your production values
nano .env
```

#### 3. Start Infrastructure Services

Start PostgreSQL, ClickHouse, and Redis:

```bash
docker compose up -d
```

This will start:
- **PostgreSQL** on port 5432
- **ClickHouse** on ports 8123 (HTTP) and 9000 (Native)
- **Redis** on port 6379

#### 4. Initialize Databases

**PostgreSQL Setup**:
```bash
# Run migrations
bun db:migrate

# Seed initial data (optional)
bun db:seed
```

**ClickHouse Setup**:
```bash
# Initialize ClickHouse schema
bun clickhouse:init
```

#### 5. Build Application

```bash
# Install dependencies
bun install

# Build all services
bun build
```

#### 6. Build Docker Images

```bash
# Build Dashboard image
docker build -f dashboard.Dockerfile -t databuddy-dashboard:latest .

# Build API image
docker build -f api.Dockerfile -t databuddy-api:latest .

# Build Basket image
docker build -f basket.Dockerfile -t databuddy-basket:latest .
```

#### 7. Create Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  dashboard:
    image: databuddy-dashboard:latest
    container_name: databuddy-dashboard
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
      - BETTER_AUTH_URL=${BETTER_AUTH_URL}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  api:
    image: databuddy-api:latest
    container_name: databuddy-api
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - CLICKHOUSE_URL=${CLICKHOUSE_URL}
      - REDIS_URL=${REDIS_URL}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - AUTUMN_SECRET_KEY=${AUTUMN_SECRET_KEY}
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - clickhouse
      - redis
    restart: unless-stopped

  basket:
    image: databuddy-basket:latest
    container_name: databuddy-basket
    environment:
      - NODE_ENV=production
      - CLICKHOUSE_URL=${CLICKHOUSE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "4000:4000"
    depends_on:
      - clickhouse
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:17
    container_name: databuddy-postgres
    environment:
      POSTGRES_DB: databuddy
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  clickhouse:
    image: clickhouse/clickhouse-server:25.5.1-alpine
    container_name: databuddy-clickhouse
    environment:
      CLICKHOUSE_DB: databuddy_analytics
      CLICKHOUSE_USER: ${CLICKHOUSE_USER}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: databuddy-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    restart: unless-stopped

volumes:
  postgres_data:
  clickhouse_data:
  redis_data:

networks:
  default:
    name: databuddy-network
```

#### 8. Start Production Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

#### 9. Configure Reverse Proxy (Nginx)

Create `/etc/nginx/sites-available/databuddy`:

```nginx
# Dashboard
server {
    listen 80;
    server_name app.yourdomain.com;

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

# API Server
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Basket (Analytics Collection)
server {
    listen 80;
    server_name collect.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers for analytics
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
    }
}
```

Enable site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/databuddy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 10. Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com -d collect.yourdomain.com
```

### Kubernetes

For Kubernetes deployments, see our [Helm charts](https://github.com/databuddy-analytics/helm-charts) (coming soon).

### Cloud Platforms

#### Vercel (Dashboard Only)

The Dashboard can be deployed to Vercel:

1. Fork the repository
2. Connect to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy API and Basket separately (e.g., on Railway, Render, or DigitalOcean)

**Note**: You'll need to deploy API and Basket services elsewhere as Vercel doesn't support long-running processes.

#### Railway

Railway supports full-stack deployments:

1. Create new project in Railway
2. Connect GitHub repository
3. Add PostgreSQL, Redis services from Railway marketplace
4. Deploy ClickHouse separately or use managed ClickHouse Cloud
5. Configure environment variables
6. Deploy Dashboard, API, and Basket as separate services

#### AWS/GCP/Azure

For enterprise deployments on major cloud providers:

- Use managed PostgreSQL (RDS, Cloud SQL, Azure Database)
- Use managed Redis (ElastiCache, Memorystore, Azure Cache)
- Deploy ClickHouse on compute instances or use ClickHouse Cloud
- Use ECS/Cloud Run/Container Instances for application containers
- Use ALB/Cloud Load Balancer for traffic distribution
- Use S3/Cloud Storage/Blob Storage for file storage

## Database Setup

### PostgreSQL

**Initial Setup**:
```bash
# Connect to PostgreSQL
psql -h localhost -U databuddy -d databuddy

# Create database (if not using docker-compose)
CREATE DATABASE databuddy;

# Run migrations
bun db:migrate
```

**Backup**:
```bash
# Create backup
pg_dump -h localhost -U databuddy databuddy > backup.sql

# Restore backup
psql -h localhost -U databuddy databuddy < backup.sql
```

### ClickHouse

**Initial Setup**:
```bash
# Initialize schema
bun clickhouse:init
```

**Configuration**:
- Configure retention policies in ClickHouse for automatic data cleanup
- Set up materialized views for common aggregations
- Configure replication for high availability (if using multiple nodes)

**Backup**:
```bash
# Backup ClickHouse data
clickhouse-client --query "BACKUP DATABASE databuddy_analytics TO Disk('backups', 'backup-{date}.zip')"
```

### Redis

**Configuration**:
- Enable persistence with AOF (Append-Only File)
- Set `maxmemory-policy allkeys-lru` for automatic eviction
- Configure appropriate `maxmemory` based on available RAM

## Service Configuration

### Dashboard (Port 3000)

**Environment**:
- `NEXT_PUBLIC_API_URL` - API server URL
- `BETTER_AUTH_URL` - Dashboard URL (for auth callbacks)
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection

**Resources**:
- Memory: 512MB - 2GB
- CPU: 0.5 - 2 cores
- Disk: Minimal (Next.js caches)

### API Server (Port 3001)

**Environment**:
- `DATABASE_URL` - PostgreSQL connection
- `CLICKHOUSE_URL` - ClickHouse connection
- `REDIS_URL` - Redis connection
- `AUTUMN_SECRET_KEY` - Rate limiting key

**Resources**:
- Memory: 1GB - 4GB
- CPU: 1 - 4 cores
- Disk: Minimal

### Basket (Port 4000)

**Environment**:
- `CLICKHOUSE_URL` - ClickHouse connection
- `REDIS_URL` - Redis connection

**Resources**:
- Memory: 512MB - 2GB
- CPU: 1 - 2 cores
- Disk: Minimal

**Scaling**: Basket is stateless and can be horizontally scaled for high traffic.

## Security Checklist

### Before Going Live

- [ ] Change all default passwords
- [ ] Generate secure random secrets for `BETTER_AUTH_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/SSL for all services
- [ ] Configure firewall to restrict database access
- [ ] Enable database backups
- [ ] Set up monitoring and alerting
- [ ] Review and configure rate limits
- [ ] Enable Redis authentication with password
- [ ] Configure CORS properly on Basket service
- [ ] Set up proper logging and log rotation
- [ ] Review security headers (CSP, HSTS, X-Frame-Options)
- [ ] Disable debug modes and verbose logging
- [ ] Set up automated security updates
- [ ] Configure fail2ban or similar for SSH protection

### Firewall Rules

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to databases (only allow from app network)
sudo ufw deny 5432/tcp
sudo ufw deny 8123/tcp
sudo ufw deny 9000/tcp
sudo ufw deny 6379/tcp

# Enable firewall
sudo ufw enable
```

### Database Security

**PostgreSQL**:
- Use strong passwords
- Disable remote root access
- Use SSL connections
- Regular security updates

**ClickHouse**:
- Enable authentication
- Use strong passwords
- Restrict network access
- Regular security updates

**Redis**:
- Enable `requirepass` authentication
- Bind to localhost or private network only
- Disable dangerous commands (`CONFIG`, `FLUSHALL`)
- Use SSL/TLS for connections

## Monitoring & Logging

### Health Checks

Each service exposes a `/health` endpoint:

```bash
# Dashboard health check
curl https://app.yourdomain.com/api/health

# API health check
curl https://api.yourdomain.com/health

# Basket health check
curl https://collect.yourdomain.com/health
```

### Logging

Databuddy uses Pino for structured logging. Logs can be sent to:
- **Logtail/Axiom**: Configure with `LOGTAIL_SOURCE_TOKEN`
- **File-based**: Standard output (capture with Docker logging driver)
- **Syslog**: Configure in production

### Metrics

Monitor these key metrics:
- Request rate (requests/second)
- Error rate (errors/second)
- Response latency (p50, p95, p99)
- Database connection pool usage
- Memory and CPU usage
- Disk usage (especially ClickHouse)

### Alerting

Set up alerts for:
- Service downtime
- High error rates (>1%)
- Slow response times (p95 > 1s)
- Database connection failures
- Disk space < 10%
- Memory usage > 90%

## Scaling Considerations

### Horizontal Scaling

**Dashboard**:
- Deploy multiple instances behind load balancer
- Use shared Redis for session storage
- Enable sticky sessions if needed

**API Server**:
- Stateless design allows easy horizontal scaling
- Use load balancer (round-robin or least-connections)
- Scale based on CPU/memory usage

**Basket**:
- Highly scalable, add more instances for high traffic
- Use load balancer with health checks
- Each instance writes directly to ClickHouse

### Vertical Scaling

**When to scale up**:
- PostgreSQL: When connection pool exhausted or slow queries
- ClickHouse: When query times increase or memory pressure
- Redis: When evicting frequently accessed keys

### Database Optimization

**PostgreSQL**:
- Add indexes for frequently queried columns
- Use connection pooling (PgBouncer)
- Configure `work_mem` and `shared_buffers` appropriately
- Regular `VACUUM` and `ANALYZE`

**ClickHouse**:
- Use materialized views for common aggregations
- Configure TTL for automatic data cleanup
- Partition large tables by date
- Use sampling for approximate queries on large datasets

**Redis**:
- Increase `maxmemory` as needed
- Use Redis Cluster for multi-GB datasets
- Configure appropriate eviction policy

## Troubleshooting

### Service Won't Start

**Check logs**:
```bash
docker compose logs dashboard
docker compose logs api
docker compose logs basket
```

**Common issues**:
- Missing environment variables
- Database connection failures
- Port conflicts
- Insufficient memory

### Database Connection Issues

**PostgreSQL**:
```bash
# Test connection
psql -h localhost -U databuddy -d databuddy

# Check if service is running
docker compose ps postgres

# Check logs
docker compose logs postgres
```

**ClickHouse**:
```bash
# Test connection
curl http://localhost:8123/ping

# Check if service is running
docker compose ps clickhouse

# Check logs
docker compose logs clickhouse
```

### High Memory Usage

**Dashboard/API**:
- Check for memory leaks with `bun --inspect`
- Reduce connection pool sizes
- Increase container memory limits

**ClickHouse**:
- Configure `max_memory_usage` and `max_memory_usage_for_user`
- Reduce query complexity or add more RAM
- Use sampling for large dataset queries

### Slow Queries

**PostgreSQL**:
```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**ClickHouse**:
```sql
-- Check query log
SELECT query, query_duration_ms
FROM system.query_log
WHERE type = 'QueryFinish'
ORDER BY query_duration_ms DESC
LIMIT 10;
```

### Analytics Not Recording

**Check Basket service**:
```bash
# Check if basket is running
curl https://collect.yourdomain.com/health

# Check logs
docker compose logs basket
```

**Check ClickHouse**:
```sql
-- Verify events are being written
SELECT count() FROM events WHERE timestamp > now() - INTERVAL 1 HOUR;
```

**Common issues**:
- CORS misconfiguration
- Incorrect `CLICKHOUSE_URL` in Basket
- Bot filtering too aggressive
- Client-side tracking not configured

## Backup Strategy

### Automated Backups

**PostgreSQL**:
```bash
# Daily backup cron job
0 2 * * * pg_dump -h localhost -U databuddy databuddy | gzip > /backups/postgres-$(date +\%Y\%m\%d).sql.gz
```

**ClickHouse**:
```bash
# Weekly backup
0 3 * * 0 clickhouse-client --query "BACKUP DATABASE databuddy_analytics TO Disk('backups', 'backup-$(date +\%Y\%m\%d).zip')"
```

**Redis** (if persistence enabled):
```bash
# Copy RDB file
0 4 * * * cp /var/lib/redis/dump.rdb /backups/redis-$(date +\%Y\%m\%d).rdb
```

### Backup Retention

- **Daily backups**: Keep for 7 days
- **Weekly backups**: Keep for 4 weeks
- **Monthly backups**: Keep for 12 months

## Updates & Maintenance

### Updating Databuddy

```bash
# Pull latest changes
git pull origin main

# Install dependencies
bun install

# Run migrations
bun db:migrate

# Rebuild images
docker compose build

# Restart services
docker compose -f docker-compose.prod.yml up -d
```

### Database Maintenance

**PostgreSQL**:
```sql
-- Vacuum and analyze
VACUUM ANALYZE;

-- Reindex if needed
REINDEX DATABASE databuddy;
```

**ClickHouse**:
```sql
-- Optimize tables
OPTIMIZE TABLE events FINAL;
```

---

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

For development setup, see [WARP.md](WARP.md).

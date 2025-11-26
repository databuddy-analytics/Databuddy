# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with Databuddy.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Development Issues](#development-issues)
- [Tracking Issues](#tracking-issues)
- [Database Issues](#database-issues)
- [Performance Issues](#performance-issues)
- [Production Issues](#production-issues)
- [API Issues](#api-issues)
- [Getting Help](#getting-help)

## Installation Issues

### Issue: `bun install` fails

**Symptoms:**
- Installation fails with dependency errors
- Version conflicts
- Network timeout errors

**Solutions:**

1. **Clear cache and reinstall:**
```bash
rm -rf node_modules
rm bun.lockb
bun install
```

2. **Check Bun version:**
```bash
bun --version
# Should be 1.2.0 or higher
bun upgrade
```

3. **Check Node version (if using Node):**
```bash
node --version
# Should be 20.0.0 or higher
```

4. **Network issues:**
```bash
# Use a different registry
bun install --registry=https://registry.npmmirror.com
```

### Issue: Docker services fail to start

**Symptoms:**
- PostgreSQL/ClickHouse/Redis containers don't start
- Port conflicts
- Volume mount errors

**Solutions:**

1. **Check port availability:**
```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :8123  # ClickHouse
lsof -i :6379  # Redis

# Kill conflicting processes or change ports in docker-compose.yml
```

2. **Reset Docker:**
```bash
docker-compose down -v
docker-compose up -d
```

3. **Check Docker logs:**
```bash
docker-compose logs postgres
docker-compose logs clickhouse
docker-compose logs redis
```

4. **Permissions issues:**
```bash
# Fix volume permissions
sudo chown -R $(whoami):$(whoami) ./data
```

### Issue: Database migration fails

**Symptoms:**
- `bun run db:push` fails
- Schema synchronization errors
- Connection refused errors

**Solutions:**

1. **Verify database is running:**
```bash
docker-compose ps
# All services should be "Up"

# Test connection
psql -h localhost -U databuddy -d databuddy -c "SELECT 1;"
```

2. **Check environment variables:**
```bash
# Verify DATABASE_URL is set correctly
echo $DATABASE_URL
# Should be: postgresql://user:password@localhost:5432/databuddy
```

3. **Reset database:**
```bash
# WARNING: This will delete all data
docker-compose down -v
docker-compose up -d
bun run db:push
```

4. **Manual migration:**
```bash
# Generate migration files
bun run db:generate

# Apply migrations
bun run db:migrate
```

## Development Issues

### Issue: Development server won't start

**Symptoms:**
- `bun run dev` fails
- Port already in use
- Build errors

**Solutions:**

1. **Check ports:**
```bash
# Default ports: 3000 (web), 3001 (docs)
lsof -i :3000
lsof -i :3001

# Kill processes or change ports
```

2. **Clean build:**
```bash
bun run clean
rm -rf .next
bun run dev
```

3. **Check environment variables:**
```bash
# Ensure .env.local exists and is configured
cp .env.example .env.local
# Edit .env.local with your values
```

4. **Check for TypeScript errors:**
```bash
bun run check-types
```

### Issue: Hot reload not working

**Symptoms:**
- Changes don't reflect immediately
- Must manually refresh browser
- File watcher not working

**Solutions:**

1. **Increase file watchers (Linux):**
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

2. **Check WSL2 configuration (Windows):**
```bash
# In .wslconfig file:
[wsl2]
kernelCommandLine = "sysctl.fs.inotify.max_user_watches=524288"
```

3. **Restart dev server:**
```bash
# Force restart with clean state
bun run clean
bun run dev
```

### Issue: TypeScript errors after update

**Symptoms:**
- Type errors in IDE
- Build fails with type errors
- Module not found errors

**Solutions:**

1. **Regenerate types:**
```bash
# Restart TypeScript server in your IDE
# VS Code: Cmd/Ctrl + Shift + P -> "TypeScript: Restart TS Server"

# Regenerate types
bun run check-types
```

2. **Clean TypeScript cache:**
```bash
find . -name "*.tsbuildinfo" -delete
rm -rf .next
```

3. **Update dependencies:**
```bash
bun update
```

## Tracking Issues

### Issue: Analytics not showing in dashboard

**Symptoms:**
- No data in dashboard
- Events not being tracked
- Real-time data not updating

**Solutions:**

1. **Verify SDK is loaded:**
```javascript
// Open browser console and check:
console.log(window.databuddy)
// Should show the SDK object

// Try manual tracking:
db.track('test', { source: 'troubleshooting' })
```

2. **Check Network requests:**
```javascript
// Open DevTools Network tab
// Filter: basket.databuddy.cc
// Look for POST requests to /events endpoint
// Status should be 200
```

3. **Verify Client ID:**
```javascript
// Check that Client ID is correct
console.log(document.querySelector('[data-client-id]')?.getAttribute('data-client-id'))
// Or in React:
console.log(process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID)
```

4. **Check tracking is enabled:**
```javascript
// In development, tracking might be disabled
// Check your configuration:
<Databuddy
  clientId="..."
  disabled={process.env.NODE_ENV === 'development'} // Remove or set to false
/>
```

5. **Verify ClickHouse is running:**
```bash
docker-compose ps clickhouse
# Should be "Up"

# Check ClickHouse logs
docker-compose logs clickhouse | tail -50
```

### Issue: Events tracked but not showing correct data

**Symptoms:**
- Event properties missing
- User data incorrect
- Timestamps wrong

**Solutions:**

1. **Check event payload:**
```javascript
// Monitor what's being sent
window.databuddy.debug = true

// Track event and check console
db.track('test', {
  property1: 'value1',
  property2: 'value2'
})
// Console will show full payload
```

2. **Verify data types:**
```javascript
// Properties should be JSON-serializable
// Avoid: Functions, Promises, circular references
db.track('test', {
  // Good:
  name: 'John',
  count: 42,
  active: true,
  tags: ['tag1', 'tag2'],

  // Bad:
  callback: () => {}, // Don't send functions
  promise: Promise.resolve(), // Don't send Promises
})
```

3. **Check timezone settings:**
```javascript
// Verify browser timezone
console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)
```

### Issue: CORS errors

**Symptoms:**
- CORS policy errors in console
- Events blocked by browser
- Network requests failing

**Solutions:**

1. **Check domain configuration:**
```bash
# In dashboard, verify your domain is whitelisted
# Settings -> Websites -> Allowed Domains
```

2. **Check script loading:**
```html
<!-- Ensure script has proper attributes -->
<script
  src="https://cdn.databuddy.cc/databuddy.js"
  crossorigin="anonymous"
  async
></script>
```

3. **Check environment:**
```javascript
// If self-hosting, verify CORS_ORIGIN in .env
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
```

## Database Issues

### Issue: Connection pool exhausted

**Symptoms:**
- "Connection pool exhausted" errors
- Slow queries
- Timeouts

**Solutions:**

1. **Increase pool size:**
```bash
# In .env
DATABASE_POOL_SIZE=50  # Increase from default 20
```

2. **Check for connection leaks:**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'databuddy';

-- Check long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
```

3. **Close idle connections:**
```sql
-- Terminate idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'databuddy'
  AND state = 'idle'
  AND state_change < current_timestamp - interval '5 minutes';
```

### Issue: ClickHouse queries timeout

**Symptoms:**
- Dashboard loading slowly
- Query timeout errors
- Analytics data not loading

**Solutions:**

1. **Check ClickHouse status:**
```bash
docker-compose exec clickhouse clickhouse-client --query "SELECT 1"
```

2. **Optimize tables:**
```bash
docker-compose exec clickhouse clickhouse-client --query "OPTIMIZE TABLE analytics_events FINAL"
```

3. **Check disk space:**
```bash
docker-compose exec clickhouse df -h
# Ensure sufficient space available
```

4. **Increase timeout:**
```bash
# In .env
CLICKHOUSE_QUERY_TIMEOUT=60000  # 60 seconds
```

### Issue: Database migrations fail in production

**Symptoms:**
- Migration errors in production
- Schema out of sync
- Data integrity issues

**Solutions:**

1. **Backup database first:**
```bash
pg_dump -U databuddy -d databuddy > backup.sql
```

2. **Check migration status:**
```bash
bun run db:check
```

3. **Apply migrations carefully:**
```bash
# Dry run
bun run db:migrate --dry-run

# Apply
bun run db:migrate
```

4. **Rollback if needed:**
```bash
# Restore from backup
psql -U databuddy -d databuddy < backup.sql
```

## Performance Issues

### Issue: Slow page load times

**Symptoms:**
- Dashboard loads slowly
- High TTFB (Time to First Byte)
- Poor Core Web Vitals

**Solutions:**

1. **Enable caching:**
```typescript
// Verify Redis is working
import { redis } from '@/lib/redis'
await redis.ping() // Should return "PONG"
```

2. **Optimize queries:**
```typescript
// Add database indexes
// Check slow query log
// Use query result caching
```

3. **Enable compression:**
```nginx
# In nginx.conf
gzip on;
gzip_vary on;
gzip_types text/plain text/css application/json application/javascript;
```

4. **Use CDN for static assets:**
```typescript
// Ensure assets are served from CDN
// Check Next.js config for proper asset optimization
```

### Issue: High memory usage

**Symptoms:**
- Application crashes
- Out of memory errors
- Server unresponsive

**Solutions:**

1. **Check memory usage:**
```bash
# Application memory
docker stats databuddy-app

# System memory
free -h
```

2. **Increase memory limit (Docker):**
```yaml
# In docker-compose.yml
services:
  app:
    mem_limit: 2g
    mem_reservation: 1g
```

3. **Check for memory leaks:**
```javascript
// Use Node.js profiling
node --inspect
# Connect Chrome DevTools and profile memory
```

4. **Optimize queries:**
```typescript
// Limit result sets
// Use pagination
// Stream large datasets instead of loading all at once
```

### Issue: High CPU usage

**Symptoms:**
- CPU constantly at 100%
- Slow response times
- System lag

**Solutions:**

1. **Identify CPU-intensive processes:**
```bash
docker stats
# Check which container is using most CPU
```

2. **Check for infinite loops:**
```javascript
// Review recent code changes
// Check background jobs
// Monitor worker processes
```

3. **Optimize heavy operations:**
```typescript
// Use background jobs for heavy processing
// Implement queue system
// Add rate limiting
```

## Production Issues

### Issue: Application crashes in production

**Symptoms:**
- 502/503 errors
- Application unresponsive
- Container restarts

**Solutions:**

1. **Check logs:**
```bash
# PM2 logs
pm2 logs databuddy

# Docker logs
docker-compose logs app --tail=100

# System logs
journalctl -u databuddy -n 100
```

2. **Check error tracking:**
```typescript
// If using Sentry or similar
// Review error dashboard for stack traces
```

3. **Check resource limits:**
```bash
# System resources
htop

# Docker resources
docker stats
```

4. **Implement health checks:**
```typescript
// Ensure health check endpoint is responding
curl http://localhost:3000/api/health
```

### Issue: SSL/TLS certificate errors

**Symptoms:**
- "Certificate invalid" errors
- HTTPS not working
- Mixed content warnings

**Solutions:**

1. **Renew certificates:**
```bash
# Using certbot
sudo certbot renew

# Reload nginx
sudo systemctl reload nginx
```

2. **Verify certificate:**
```bash
openssl s_client -connect yourdomain.com:443 -showcerts
```

3. **Check certificate expiration:**
```bash
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

## API Issues

### Issue: API rate limiting

**Symptoms:**
- 429 (Too Many Requests) errors
- API requests blocked
- "Rate limit exceeded" messages

**Solutions:**

1. **Check rate limit headers:**
```javascript
// Response headers show limits
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
```

2. **Implement exponential backoff:**
```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options)

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || Math.pow(2, i)
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      continue
    }

    return response
  }
}
```

3. **Request higher limits:**
```
Contact support@databuddy.cc for increased rate limits
```

### Issue: API authentication failures

**Symptoms:**
- 401 (Unauthorized) errors
- Invalid token errors
- Authentication rejected

**Solutions:**

1. **Verify API key:**
```javascript
// Check API key is valid and not expired
// Check key has required scopes
```

2. **Check authentication method:**
```javascript
// Session authentication
const response = await fetch('/api/analytics', {
  credentials: 'include'
})

// API key authentication
const response = await fetch('/api/analytics', {
  headers: {
    'Authorization': `Bearer ${API_KEY}`
  }
})
```

3. **Regenerate API key:**
```
Dashboard -> Settings -> API Keys -> Create New Key
```

## Getting Help

### Before asking for help:

1. **Search existing issues:**
   - [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues)

2. **Check documentation:**
   - [Official Documentation](https://www.databuddy.cc/docs)
   - [API Reference](https://www.databuddy.cc/docs/api)

3. **Gather information:**
   - Error messages (full stack trace)
   - Steps to reproduce
   - Environment details (OS, versions, etc.)
   - Relevant configuration

### Get support:

**Community Support:**
- [Discord Community](https://discord.gg/JTk7a38tCZ) - Fast, community-driven help
- [GitHub Discussions](https://github.com/databuddy-analytics/Databuddy/discussions) - Q&A and ideas

**Issue Reporting:**
- [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues) - Bug reports and feature requests

**Email Support:**
- [support@databuddy.cc](mailto:support@databuddy.cc) - Direct support

**Enterprise Support:**
- [enterprise@databuddy.cc](mailto:enterprise@databuddy.cc) - Priority support for enterprise customers

### When reporting issues:

Include:
- **Environment**: OS, Node/Bun version, browser (if applicable)
- **Version**: Databuddy version or git commit
- **Steps to reproduce**: Clear steps to reproduce the issue
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Error messages**: Full error messages and stack traces
- **Configuration**: Relevant configuration (sanitize secrets!)

**Example bug report template:**

```markdown
## Environment
- OS: Ubuntu 22.04
- Bun version: 1.2.0
- Databuddy version: 1.0.0

## Description
Brief description of the issue

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Error Messages
```
Paste error messages here
```

## Configuration
```yaml
Relevant configuration (sanitize secrets!)
```

## Additional Context
Any additional information
```

---

**Still stuck?** Don't hesitate to reach out. We're here to help! Join our [Discord](https://discord.gg/JTk7a38tCZ) for the fastest response.

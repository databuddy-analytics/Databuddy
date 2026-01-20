# REST API Reference

The Databuddy REST API provides programmatic access to analytics data.

## Base URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Analytics API | `https://api.databuddy.cc/v1` | Query analytics data |
| Event Tracking | `https://basket.databuddy.cc` | Send custom events |

## Authentication

### API Key

Use your API key in the `x-api-key` header:

```bash
curl -H "x-api-key: dbdy_your_api_key" \
  https://api.databuddy.cc/v1/query/websites
```

Or use Bearer token format:

```bash
curl -H "Authorization: Bearer dbdy_your_api_key" \
  https://api.databuddy.cc/v1/query/websites
```

### Getting an API Key

1. Go to [Dashboard → Organization Settings → API Keys](https://app.databuddy.cc/organizations/settings/api-keys)
2. Click **Create API Key**
3. Select required scopes
4. Optionally restrict to specific websites

### API Key Scopes

| Scope | Permission |
|-------|------------|
| `read:data` | Query analytics data |
| `write:data` | Send custom events |
| `read:websites` | List accessible websites |
| `manage:websites` | Create and update websites |

## Query Endpoints

### List Websites

```http
GET /v1/query/websites
```

**Response:**

```json
{
  "success": true,
  "websites": [
    {
      "id": "web_123",
      "name": "My Website",
      "domain": "example.com"
    }
  ]
}
```

### Get Query Types

```http
GET /v1/query/types?include_meta=true
```

Returns available query types and their configurations.

### Execute Query

```http
POST /v1/query?website_id={id}
```

**Request Body:**

```json
{
  "parameters": ["summary", "pages", "browser_name"],
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "limit": 100,
  "filters": [
    { "field": "country", "op": "in", "value": ["US", "CA"] }
  ],
  "granularity": "daily"
}
```

**Or use presets:**

```json
{
  "parameters": ["summary", "pages"],
  "preset": "last_30d",
  "limit": 10
}
```

**Date Presets:**

| Preset | Description |
|--------|-------------|
| `today` | Current day |
| `yesterday` | Previous day |
| `last_7d` | Last 7 days |
| `last_14d` | Last 14 days |
| `last_30d` | Last 30 days |
| `last_90d` | Last 90 days |
| `this_week` | Current week |
| `last_week` | Previous full week |
| `this_month` | Current month to date |
| `last_month` | Previous full month |
| `this_year` | Current year to date |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "parameter": "summary",
      "success": true,
      "data": [
        { "date": "2024-01-01", "pageviews": 1250, "visitors": 890 }
      ]
    },
    {
      "parameter": "pages",
      "success": true,
      "data": [
        { "path": "/", "pageviews": 450, "visitors": 320 }
      ]
    }
  ]
}
```

## Available Query Types

### Website Analytics

| Type | Description |
|------|-------------|
| `summary` | Overall website metrics and KPIs |
| `pages` | Page views and performance by URL |
| `traffic` | Traffic sources and referrers |
| `browser_name` | Browser usage breakdown |
| `os_name` | Operating system breakdown |
| `device_types` | Device category (mobile/desktop/tablet) |
| `countries` | Visitors by country |
| `cities` | Visitors by city |
| `errors` | JavaScript errors |
| `performance` | Web vitals and load times |
| `sessions` | Session-based analytics |
| `custom_events` | Custom event data |
| `profiles` | User profile analytics |
| `outbound_links` | External link clicks |
| `engagement` | User engagement metrics |

### Link Shortener Analytics

Use `link_id` instead of `website_id`:

| Type | Description |
|------|-------------|
| `link_total_clicks` | Total click count |
| `link_clicks_by_day` | Daily click breakdown |
| `link_top_referrers` | Top traffic sources |
| `link_top_countries` | Top countries |
| `link_top_devices` | Device breakdown |
| `link_top_browsers` | Browser breakdown |

## Filter Operations

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{ "field": "country", "op": "eq", "value": "US" }` |
| `ne` | Not equals | `{ "field": "device_type", "op": "ne", "value": "bot" }` |
| `contains` | Contains substring | `{ "field": "path", "op": "contains", "value": "/blog" }` |
| `starts_with` | Starts with | `{ "field": "path", "op": "starts_with", "value": "/docs" }` |
| `in` | Value in array | `{ "field": "country", "op": "in", "value": ["US", "CA"] }` |
| `not_in` | Not in array | `{ "field": "browser", "op": "not_in", "value": ["bot"] }` |

## Event Tracking API

### Send Single Event

```http
POST https://basket.databuddy.cc/?client_id={website_id}
```

**Request Body:**

```json
{
  "type": "custom",
  "name": "purchase",
  "anonymousId": "anon_user_123",
  "sessionId": "session_456",
  "timestamp": 1704067200000,
  "properties": {
    "value": 99.99,
    "currency": "USD",
    "product_id": "prod_123"
  }
}
```

**Minimal Event:**

```json
{
  "type": "custom",
  "name": "newsletter_signup",
  "properties": { "source": "footer_form" }
}
```

### Event Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Must be `"custom"` |
| `name` | string | Yes | Event name (1-128 chars) |
| `anonymousId` | string | No | Anonymous user identifier |
| `sessionId` | string | No | Session identifier |
| `timestamp` | number | No | Unix timestamp in ms |
| `properties` | object | No | Custom properties |

### Batch Events

```http
POST https://basket.databuddy.cc/batch?client_id={website_id}
```

**Request Body:**

```json
[
  { "type": "custom", "name": "event1", "properties": {...} },
  { "type": "custom", "name": "event2", "properties": {...} }
]
```

**Response:**

```json
{
  "status": "success",
  "batch": true,
  "processed": 2,
  "results": [
    { "status": "success", "type": "custom", "eventId": "evt_123" },
    { "status": "success", "type": "custom", "eventId": "evt_124" }
  ]
}
```

## Custom Queries

For advanced queries with custom aggregations:

```http
POST /v1/query/custom?website_id={id}
```

**Request Body:**

```json
{
  "query": {
    "table": "events",
    "selects": [
      { "field": "path", "aggregate": "count", "alias": "pageviews" },
      { "field": "anonymous_id", "aggregate": "uniq", "alias": "visitors" }
    ],
    "filters": [
      { "field": "country", "operator": "eq", "value": "US" }
    ],
    "groupBy": ["path"]
  },
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "limit": 100
}
```

### Available Tables

| Table | Description |
|-------|-------------|
| `events` | Page views and custom events |
| `sessions` | Session-level data |
| `profiles` | User profile data |
| `errors` | JavaScript errors |
| `performance` | Web vitals metrics |

### Aggregate Functions

| Function | Description |
|----------|-------------|
| `count` | Count rows |
| `uniq` | Count unique values |
| `sum` | Sum numeric values |
| `avg` | Average value |
| `max` | Maximum value |
| `min` | Minimum value |

## Error Codes

| Code | Meaning |
|------|---------|
| `AUTH_REQUIRED` | No API key or session provided |
| `ACCESS_DENIED` | No access to requested resource |
| `INVALID_API_KEY` | API key invalid or revoked |
| `INSUFFICIENT_SCOPE` | API key lacks required scope |
| `RATE_LIMITED` | Too many requests |

## Rate Limits

- Standard queries: 200+ requests/minute
- Custom queries: 30 requests/minute

## Health Check

```http
GET /health
```

```json
{
  "clickhouse": true,
  "database": true,
  "redis": true,
  "success": true,
  "version": "1.0.0"
}
```

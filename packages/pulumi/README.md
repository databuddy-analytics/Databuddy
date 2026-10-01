# @databuddy/pulumi

Keep your Databuddy uptime monitors and status pages in code, next to the infrastructure they watch.

```sh
npm install @databuddy/pulumi
pulumi config set --secret databuddy:apiKey dbdy_...
```

Create the key under Organization settings > API keys with the **Monitors** and **Status Pages** presets. In CI you can set `DATABUDDY_API_KEY` instead.

```ts
import { StatusPage, StatusPageMonitor, UptimeMonitor } from "@databuddy/pulumi";

const api = new UptimeMonitor("api", {
	url: "https://api.example.com/health",
	name: "API",
	granularity: "minute",
});

const status = new StatusPage("status", {
	name: "Example",
	slug: "example",
});

new StatusPageMonitor("api-on-status", {
	statusPageId: status.id,
	monitorId: api.id,
	displayName: "API",
	hideUrl: true,
});
```

`pulumi refresh` picks up edits made in the dashboard, and the next `pulumi up` puts them back to what your code says.

## Resources

| Resource | Arguments |
| --- | --- |
| `UptimeMonitor` | `url`, `granularity`, `name`, `timeout` (ms), `cacheBust`, `paused`, `websiteId` |
| `StatusPage` | `name`, `slug`, `description`, `logoUrl`, `faviconUrl`, `websiteUrl`, `supportUrl`, `theme`, `organizationId` |
| `StatusPageMonitor` | `statusPageId`, `monitorId`, `displayName`, `order`, `hideUrl`, `hideUptimePercentage`, `hideLatency` |

`granularity` is one of `minute`, `five_minutes`, `ten_minutes`, `thirty_minutes`, `hour`, `six_hours`, `twelve_hours`, `day`.

Changing a monitor's `url` or `websiteId`, or a status page's `organizationId`, deletes and recreates it.

## Good to know

- Works in TypeScript and JavaScript Pulumi programs, CommonJS or ESM, on Pulumi 3.139 or newer.
- Monitors that already exist in the dashboard can't be imported. Delete them there and let Pulumi create them, or keep them out of code.
- Point at a self-hosted API with `pulumi config set databuddy:apiUrl https://api.your-domain.com` or `DATABUDDY_API_URL`.

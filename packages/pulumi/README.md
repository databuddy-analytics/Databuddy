# @databuddy/pulumi

Keep your Databuddy uptime monitors and status pages in code, next to the infrastructure they watch.

```sh
npm install @databuddy/pulumi
pulumi config set --secret databuddy:apiKey dbdy_...
```

Create the key under Organization settings > API keys with the Read Monitors, Write Monitors, Read Status Pages and Write Status Pages scopes. Status pages are created in the key's organization. In CI you can export `DATABUDDY_API_KEY` instead.

```ts
import * as pulumi from "@pulumi/pulumi";
import { StatusPage, StatusPageMonitor, UptimeMonitor } from "@databuddy/pulumi";

const api = new UptimeMonitor("api", {
	url: "https://api.example.com/health",
	name: "API",
	granularity: "minute",
});

const status = new StatusPage("status", {
	name: "Example",
	slug: `acme-${pulumi.getStack()}`,
});

new StatusPageMonitor("api-on-status", {
	statusPageId: status.id,
	monitorId: api.id,
	displayName: "API",
	hideUrl: true,
});
```

Replace `acme` with your own name. Slugs allow lowercase letters, numbers and dashes.

`pulumi refresh` picks up edits made in the dashboard, and the next `pulumi up` puts them back to what your code says. Fields listed in `ignoreChanges` keep their dashboard value.

## Resources

| Resource | Arguments |
| --- | --- |
| `UptimeMonitor` | `url`, `granularity`, `name`, `timeout` (ms), `cacheBust`, `paused`, `websiteId` |
| `StatusPage` | `name`, `slug`, `description`, `logoUrl`, `faviconUrl`, `websiteUrl`, `supportUrl`, `theme` |
| `StatusPageMonitor` | `statusPageId`, `monitorId`, `displayName`, `order`, `hideUrl`, `hideUptimePercentage`, `hideLatency` |

`granularity` is one of `minute`, `five_minutes`, `ten_minutes`, `thirty_minutes`, `hour`, `six_hours`, `twelve_hours`, `day`.

Changing a monitor's `url` or `websiteId` replaces it. Its check history starts over, dashboard alerts need to be pointed at the new monitor, and status page entries added in the dashboard for it are removed. Pulumi creates the new monitor before removing the old one, except when it keeps the same URL or website, which have to be freed first. Moving a `StatusPageMonitor` to another page or monitor removes it from incidents that listed it.

## Good to know

- Status page slugs are unique across every Databuddy account. Within an organization, monitor URLs are unique and a website can have only one monitor, so stacks that share an organization need their own URLs and websites.
- Renaming a resource or moving it under a parent needs `aliases`, otherwise Pulumi tries to create a second monitor or page with the same URL or slug. A URL or slug has to be removed in one `pulumi up` before another resource can take it in the next.
- Monitors and status pages that already exist in the dashboard can't be imported. Delete them there and let Pulumi create them, or leave them out of code.
- Requests run at most 8 at a time and retry automatically when the API is rate limiting.
- Runs on Pulumi's `nodejs` runtime, in TypeScript or JavaScript, CommonJS or ESM. Bun works as the package manager, but `runtime: bun` can't run dynamic providers. The Pulumi CLI and `@pulumi/pulumi` both need to be 3.216 or newer.
- `DATABUDDY_API_KEY` and `DATABUDDY_API_URL` are read from the environment that runs `pulumi` (your shell, CI, or Automation API `envVars`), not from variables set inside your program.
- Behind a proxy, export `NODE_USE_ENV_PROXY=1` (Node 22.21 or newer) with `HTTPS_PROXY`. Behind TLS inspection, export `NODE_EXTRA_CA_CERTS` with your CA bundle.
- Point at a self-hosted API with `pulumi config set databuddy:apiUrl https://api.your-domain.com`. API URLs require HTTPS; HTTP is allowed only for `localhost`, `127.0.0.1`, and `[::1]`.

# @databuddy/pulumi

Manage Databuddy uptime monitors and status pages from Pulumi.

```sh
npm install @databuddy/pulumi
pulumi config set --secret databuddy:apiKey dbdy_...
```

The key needs `read:monitors`, `write:monitors`, `read:status_pages`, and `write:status_pages`. Requires Pulumi 3.216 or newer and the `nodejs` runtime.

```ts
import * as pulumi from "@pulumi/pulumi";
import { StatusPage, StatusPageMonitor, UptimeMonitor } from "@databuddy/pulumi";

const api = new UptimeMonitor("api", {
	url: "https://api.example.com/health",
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
});
```

Full reference, CI setup, and troubleshooting: [databuddy.cc/docs/infrastructure-as-code/pulumi](https://www.databuddy.cc/docs/infrastructure-as-code/pulumi)

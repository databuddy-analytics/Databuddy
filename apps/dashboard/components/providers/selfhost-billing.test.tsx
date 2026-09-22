import { spawn } from "bun";
import { afterAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

const original = process.env.NEXT_PUBLIC_SELFHOST;
process.env.NEXT_PUBLIC_SELFHOST = "true";
const { BillingProvider, useBillingContext, useInvestigationUsage } =
	await import("./billing-provider");
const { settingsNavigation } = await import(
	"../layout/navigation/navigation-config"
);
const { orpc } = await import("../../lib/orpc");

afterAll(() => {
	if (original === undefined) {
		Reflect.deleteProperty(process.env, "NEXT_PUBLIC_SELFHOST");
	} else {
		process.env.NEXT_PUBLIC_SELFHOST = original;
	}
});

function Access() {
	const billing = useBillingContext();
	const investigations = useInvestigationUsage();
	return (
		<span>
			{JSON.stringify({
				isLoading: billing.isLoading,
				isFetching: billing.isFetching,
				plan: billing.currentPlanId,
				subscription: billing.hasActiveSubscription,
				upgrades: billing.canUserUpgrade,
				customer: billing.customer,
				errors: billing.isFeatureEnabled("error_tracking"),
				goals: billing.getGatedFeatureAccess("goals").limit,
				events: billing.canUse("events"),
				chat: billing.canUse("agent_credits"),
				investigations: investigations.canUse,
				investigationAccess: investigations.hasAccess,
				paidInvestigations: investigations.fixedPrice,
			})}
		</span>
	);
}

test.each([
	false,
	true,
])("self-hosted billing exposes local features and actual AI configuration (%s)", (aiConfigured) => {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	client.setQueryData(orpc.organizations.getBillingContext.queryKey(), {
		aiConfigured,
	});
	// No AutumnProvider: taking a hosted billing hook path would fail this render.
	const markup = renderToStaticMarkup(
		<QueryClientProvider client={client}>
			<BillingProvider>
				<Access />
			</BillingProvider>
		</QueryClientProvider>
	);
	expect(markup).toContain(
		JSON.stringify({
			isLoading: false,
			isFetching: false,
			plan: null,
			subscription: false,
			upgrades: false,
			customer: null,
			errors: true,
			goals: "unlimited",
			events: true,
			chat: aiConfigured,
			investigations: aiConfigured,
			investigationAccess: aiConfigured,
			paidInvestigations: false,
		}).replaceAll('"', "&quot;")
	);
	expect(
		settingsNavigation
			.flatMap(({ items }) => items)
			.some(({ href }) => href.startsWith("/billing"))
	).toBe(false);
	client.clear();
});

test("self-hosted background fetch preserves cached AI denial without initial loading", async () => {
	const client = new QueryClient();
	const queryKey = orpc.organizations.getBillingContext.queryKey();
	const capability = { aiConfigured: false };
	client.setQueryData(queryKey, capability);
	const { promise, resolve } = Promise.withResolvers<typeof capability>();
	const fetch = client.fetchQuery({ queryKey, queryFn: () => promise });
	try {
		const markup = renderToStaticMarkup(
			<QueryClientProvider client={client}>
				<BillingProvider>
					<Access />
				</BillingProvider>
			</QueryClientProvider>
		);
		expect(markup).toContain(
			"&quot;isLoading&quot;:false,&quot;isFetching&quot;:true"
		);
		expect(markup).toContain("&quot;chat&quot;:false");
		expect(markup).toContain("&quot;investigations&quot;:false");
	} finally {
		resolve(capability);
		await fetch;
		client.clear();
	}
});

test.each([
	undefined,
	"false",
])("hosted billing still requires Autumn when SELFHOST=%s", async (selfhost) => {
	const child = spawn(
		[
			process.execPath,
			"--no-env-file",
			"-e",
			`
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BillingProvider } from "./billing-provider";
import { settingsNavigation } from "../layout/navigation/navigation-config";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
assert.throws(() => renderToStaticMarkup(
  createElement(QueryClientProvider, { client }, createElement(BillingProvider, null, "example"))
), /AutumnProvider/);
assert.ok(settingsNavigation.flatMap(({ items }) => items).some(({ href }) => href.startsWith("/billing")));
client.clear();
`,
		],
		{
			cwd: import.meta.dir,
			env: {
				NODE_ENV: "production",
				NEXT_PUBLIC_SELFHOST: selfhost,
				NEXT_PUBLIC_DATABUDDY_E2E_MODE: "false",
			},
			stdout: "ignore",
			stderr: "pipe",
		}
	);
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	expect(exitCode, stderr).toBe(0);
});

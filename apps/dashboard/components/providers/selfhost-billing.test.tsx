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

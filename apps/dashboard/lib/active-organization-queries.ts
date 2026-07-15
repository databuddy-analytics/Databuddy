import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { AUTH_QUERY_KEYS } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

const ACTIVE_ORGANIZATION_QUERY_ROOTS: QueryKey[] = [
	orpc.agentChats.key(),
	orpc.alarms.key(),
	orpc.annotations.key(),
	orpc.anomalies.key(),
	orpc.apikeys.key(),
	orpc.autocomplete.key(),
	orpc.billing.key(),
	orpc.feedback.key(),
	orpc.flags.key(),
	orpc.funnels.key(),
	orpc.goals.key(),
	orpc.insightGeneration.key(),
	orpc.insights.key(),
	orpc.integrations.key(),
	orpc.linkFolders.key(),
	orpc.links.key(),
	orpc.organizations.key(),
	orpc.profiles.key(),
	orpc.revenue.key(),
	orpc.statusPage.key(),
	orpc.targetGroups.key(),
	orpc.tracker.key(),
	orpc.uptime.key(),
	orpc.websites.key(),
];

type OrganizationQueryClient = Pick<
	QueryClient,
	"invalidateQueries" | "removeQueries"
>;

export async function resetActiveOrganizationQueries(
	queryClient: OrganizationQueryClient
): Promise<void> {
	for (const queryKey of ACTIVE_ORGANIZATION_QUERY_ROOTS) {
		queryClient.removeQueries({ queryKey });
	}
	await queryClient.invalidateQueries({
		queryKey: AUTH_QUERY_KEYS.activeOrganization,
	});
}

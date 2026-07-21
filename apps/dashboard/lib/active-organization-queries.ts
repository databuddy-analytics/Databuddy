import type { QueryClient } from "@tanstack/react-query";
import { AUTH_QUERY_KEYS } from "@/components/providers/organizations-provider";
import { insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";

const ACTIVE_ORGANIZATION_QUERY_ROOTS = [orpc.key(), insightQueries.all()];

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

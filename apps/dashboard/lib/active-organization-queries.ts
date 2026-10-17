import type { QueryClient } from "@tanstack/react-query";
import { insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";

export const ORGANIZATIONS_QUERY_KEY = ["auth", "organizations"] as const;

export async function resetActiveOrganizationQueries(
	queryClient: Pick<QueryClient, "invalidateQueries" | "removeQueries">
): Promise<void> {
	queryClient.removeQueries({ queryKey: orpc.key() });
	queryClient.removeQueries({ queryKey: insightQueries.all() });
	await queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY });
}

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";
import { insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import {
	ORGANIZATIONS_QUERY_KEY,
	resetActiveOrganizationQueries,
} from "./active-organization-queries";

describe("resetActiveOrganizationQueries", () => {
	test("removes organization data without clearing unrelated query state", async () => {
		const queryClient = new QueryClient();
		const unrelatedKey = ["global", "release-notes"] as const;
		queryClient.setQueryData(unrelatedKey, "keep");
		queryClient.setQueryData(orpc.websites.key(), "old websites");
		queryClient.setQueryData(orpc.billing.key(), "old billing");
		queryClient.setQueryData(orpc.feedback.key(), "old feedback");
		queryClient.setQueryData(orpc.insights.key(), "old insights");
		queryClient.setQueryData(
			insightQueries.historyInfinite("old-org").queryKey,
			"old insight feed"
		);
		queryClient.setQueryData(ORGANIZATIONS_QUERY_KEY, ["old org"]);

		await resetActiveOrganizationQueries(queryClient);

		expect(queryClient.getQueryData(orpc.websites.key())).toBeUndefined();
		expect(queryClient.getQueryData(orpc.billing.key())).toBeUndefined();
		expect(queryClient.getQueryData(orpc.feedback.key())).toBeUndefined();
		expect(queryClient.getQueryData(orpc.insights.key())).toBeUndefined();
		expect(
			queryClient.getQueryData(
				insightQueries.historyInfinite("old-org").queryKey
			)
		).toBeUndefined();
		expect(queryClient.getQueryData(unrelatedKey)).toBe("keep");
		expect(
			queryClient.getQueryState(ORGANIZATIONS_QUERY_KEY)?.isInvalidated
		).toBe(true);
	});
});

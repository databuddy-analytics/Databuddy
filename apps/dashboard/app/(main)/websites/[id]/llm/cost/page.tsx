"use client";

import { LlmCostTab } from"../_components/llm-cost-tab";
import { LlmTabPageWrapper } from"../_components/llm-tab-page-wrapper";

export default function LlmCostPage() {
	return (
		<LlmTabPageWrapper>
			{(websiteId, dateRange) => (
				<LlmCostTab dateRange={dateRange} websiteId={websiteId} />
			)}
		</LlmTabPageWrapper>
	);
}

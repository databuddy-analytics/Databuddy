"use client";

import { LlmErrorsTab } from"../_components/llm-errors-tab";
import { LlmTabPageWrapper } from"../_components/llm-tab-page-wrapper";

export default function LlmErrorsPage() {
	return (
		<LlmTabPageWrapper>
			{(websiteId, dateRange) => (
				<LlmErrorsTab dateRange={dateRange} websiteId={websiteId} />
			)}
		</LlmTabPageWrapper>
	);
}

"use client";

import { LlmTabPageWrapper } from"../_components/llm-tab-page-wrapper";
import { LlmTracesTab } from"../_components/llm-traces-tab";

export default function LlmTracesPage() {
	return (
		<LlmTabPageWrapper>
			{(websiteId, dateRange) => (
				<LlmTracesTab dateRange={dateRange} websiteId={websiteId} />
			)}
		</LlmTabPageWrapper>
	);
}

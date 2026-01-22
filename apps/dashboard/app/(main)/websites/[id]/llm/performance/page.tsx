"use client";

import { LlmPerformanceTab } from"../_components/llm-performance-tab";
import { LlmTabPageWrapper } from"../_components/llm-tab-page-wrapper";

export default function LlmPerformancePage() {
	return (
		<LlmTabPageWrapper>
			{(websiteId, dateRange) => (
				<LlmPerformanceTab dateRange={dateRange} websiteId={websiteId} />
			)}
		</LlmTabPageWrapper>
	);
}

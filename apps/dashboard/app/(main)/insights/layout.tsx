import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Findings",
	description: "Organization-wide findings with evidence and next steps.",
};

export default function InsightsLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			{children}
		</div>
	);
}

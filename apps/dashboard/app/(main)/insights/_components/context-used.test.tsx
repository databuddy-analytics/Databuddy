import { describe, expect, it } from "bun:test";
import type { BusinessContext } from "@databuddy/shared/insights";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextUsed } from "./context-used";

const snapshot: BusinessContext = {
	capturedAt: "2026-09-08T12:00:00Z",
	status: "ready",
	issues: [],
	sources: [
		{
			id: "profile-example",
			kind: "organization_profile",
			origin: "team",
			content: "Preparation starts a draft. <script>unsafe()</script>",
			observedAt: "2026-09-08T11:00:00Z",
			profileVersion: { revision: 3, updatedAt: "2026-09-08T11:00:00Z" },
			references: [
				{ title: "Report guide", url: "https://example.com/reports" },
			],
		},
	],
};

describe("Business context disclosure", () => {
	it("shows supplied text and revision without claiming fact-to-claim attribution", () => {
		const html = renderToStaticMarkup(<ContextUsed snapshot={snapshot} />);
		expect(html).toContain("Business context");
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("Background available for this update.");
		expect(html).toContain(
			"does not identify which facts influenced individual claims"
		);
		expect(html).toContain("Revision 3");
		expect(html).toContain('dateTime="2026-09-08T11:00:00Z"');
		expect(html).toContain('href="https://example.com/reports"');
		expect(html).toContain("Report guide");
		expect(html).toContain("Preparation starts a draft.");
		expect(html).not.toContain("<script>");
	});
	it("distinguishes mixed background from named team priorities at the supplied revision", () => {
		const html = renderToStaticMarkup(
			<ContextUsed
				snapshot={{
					...snapshot,
					sources: [
						{
							id: "mixed-background",
							kind: "organization_profile",
							origin: "mixed",
							content: "Edited public background",
							author: "Edited website background",
							observedAt: snapshot.capturedAt,
							profileVersion: { revision: 4, updatedAt: snapshot.capturedAt },
						},
						{
							id: "team-context",
							kind: "organization_profile",
							origin: "team",
							content: "Priority: completed downloads",
							author: "Team priorities and definitions",
							observedAt: snapshot.capturedAt,
							profileVersion: { revision: 4, updatedAt: snapshot.capturedAt },
						},
					],
				}}
			/>
		);
		expect(html).toContain("Website background with team edits");
		expect(html).toContain("Team priorities and definitions");
		expect(html).toContain("Priority: completed downloads");
		expect(html.match(/Revision 4/g)).toHaveLength(2);
	});
	it("does not invent provenance for legacy results and explains unavailable context", () => {
		expect(renderToStaticMarkup(<ContextUsed />)).toBe("");
		const html = renderToStaticMarkup(
			<ContextUsed
				snapshot={{ ...snapshot, status: "unavailable", sources: [] }}
			/>
		);
		expect(html).toContain("Business context was unavailable for this update.");
		expect(html).not.toContain("Revision");
	});
	it("does not turn non-web source URLs into clickable links", () => {
		const source = snapshot.sources[0];
		if (!source) {
			throw new Error("Expected source fixture");
		}
		const html = renderToStaticMarkup(
			<ContextUsed
				snapshot={{
					...snapshot,
					sources: [
						{
							...source,
							references: [
								{ title: "Untrusted link", url: "javascript:alert(1)" },
							],
						},
					],
				}}
			/>
		);
		expect(html).toContain("Untrusted link");
		expect(html).not.toContain('href="javascript:');
	});
});

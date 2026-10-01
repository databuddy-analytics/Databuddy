import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AITrafficSection } from "./ai-traffic-section";

test("AI traffic separates requests from deduplicated visitors and retains referral fallback", () => {
	const markup = renderToStaticMarkup(
		<AITrafficSection
			agentsHref="/websites/example/agents"
			isLoading={false}
			products={[
				{ product: "ChatGPT", requests: 12, visitors: 7 },
				{ product: "Claude", requests: 5, visitors: 7 },
			]}
			referrers={[]}
			totalVisitors={7}
		/>
	);
	expect(markup).toContain(">7</p>");
	expect(markup).toContain(">17</p>");
	expect(markup).toContain("AI visitors");
	expect(markup).toContain("Agent requests");
	expect(markup).toContain("7 visitors · 12 requests");
	expect(markup).toContain('href="/websites/example/agents"');

	const requestsOnly = renderToStaticMarkup(
		<AITrafficSection
			isLoading={false}
			products={[{ product: "Claude", requests: 2, visitors: 0 }]}
			referrers={[]}
			totalVisitors={0}
		/>
	);
	expect(requestsOnly).toContain("0 visitors · 2 requests");

	const referrals = renderToStaticMarkup(
		<AITrafficSection
			isLoading={false}
			referrers={[
				{ name: "ChatGPT", referrer_type: "ai", visitors: 7 },
				{ name: "Google", referrer_type: "search", visitors: 100 },
			]}
		/>
	);
	expect(referrals).toContain("AI referrals");
	expect(referrals).toContain("7 visitors");
	expect(referrals).not.toContain("Google");
	expect(referrals).not.toContain("Agent requests");
	expect(referrals).not.toContain("View agents");

	expect(
		renderToStaticMarkup(
			<AITrafficSection isLoading={false} products={[]} referrers={[]} />
		)
	).toBe("");
});

import { expect, TRACKING_VERIFIED, test } from "@/test/e2e/fixtures";

const GPTBOT =
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const GOOGLEBOT_RENDERER =
	"Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.36 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function clickHouseTime(offsetMs: number): string {
	return new Date(Date.now() - offsetMs)
		.toISOString()
		.replace("T", " ")
		.replace("Z", "");
}

async function insertAgentSpans(rows: Record<string, unknown>[]) {
	const url = new URL(
		process.env.CLICKHOUSE_URL ??
			"http://default:@localhost:8123/databuddy_analytics"
	);
	const credentials = btoa(
		`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
	);
	url.username = "";
	url.password = "";
	url.pathname = "/";
	url.search = `?query=${encodeURIComponent("INSERT INTO analytics.ai_traffic_spans FORMAT JSONEachRow")}`;
	const response = await fetch(url, {
		method: "POST",
		headers: { authorization: `Basic ${credentials}` },
		body: rows.map((row) => JSON.stringify(row)).join("\n"),
	});
	if (!response.ok) {
		throw new Error(`Seeding agent spans failed: ${await response.text()}`);
	}
}

test("shows search engines next to AI crawlers without counting them as AI", {
	tag: "@regression",
}, async ({ authenticatedPage: page, e2eSession, mockRpc }) => {
	const websiteId = e2eSession.websiteId ?? "";
	const span = {
		client_id: websiteId,
		source: "tracker",
		format: "html",
		status_code: 0,
	};
	await insertAgentSpans([
		{
			...span,
			timestamp: clickHouseTime(3_600_000),
			agent_id: "openai-crawler",
			agent_purpose: "training",
			bot_type: "ai_crawler",
			bot_name: "GPTBot",
			user_agent: GPTBOT,
			path: "/docs",
		},
		...["/", "/pricing"].map((path, index) => ({
			...span,
			timestamp: clickHouseTime(7_200_000 + index * 60_000),
			agent_id: "",
			agent_purpose: "",
			bot_type: "search_engine",
			bot_name: "GoogleBot",
			user_agent: GOOGLEBOT_RENDERER,
			path,
		})),
	]);
	await mockRpc("websites/isTrackingSetup", TRACKING_VERIFIED);

	await page.goto(`/websites/${websiteId}/agents`);

	await expect(page.getByText("Search engines", { exact: true })).toBeVisible();
	await expect(page.getByText("Google", { exact: true })).toBeVisible();
	await expect(page.getByText("Rendered", { exact: true })).toBeVisible();
	await expect(page.getByText("2 pages read", { exact: false })).toBeVisible();
	await expect(page.getByText("Who reads your content")).toBeVisible();
});

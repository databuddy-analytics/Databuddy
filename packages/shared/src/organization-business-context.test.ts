import { expect, test } from "bun:test";
import {
	businessContextSourceBelongsToSite,
	businessContextSourceUrlsSchema,
	businessContextResearchSchema,
	businessContextFollowUpQuestionsSchema,
	businessBriefSchema,
} from "./organization-business-context";

test("business source pages are bounded public URLs scoped to the selected site", () => {
	const urls = [
		"https://example.com/pricing",
		"https://docs.example.com/start",
	];
	expect(businessContextSourceUrlsSchema.parse(urls)).toEqual(urls);
	for (const url of urls) {
		expect(businessContextSourceBelongsToSite(url, "www.example.com")).toBe(
			true
		);
	}
	for (const url of [
		"https://example.com.evil.example/",
		"https://other.example/",
	]) {
		expect(businessContextSourceBelongsToSite(url, "example.com")).toBe(false);
	}
	for (const url of [
		"not a URL",
		"file:///secret",
		"http://127.0.0.1/",
		"http://[::1]/",
		"http://localhost/",
		"https://app.internal/",
		"https://user:secret@example.com/",
		"https://example.com:444/",
		"https://example.com/?token=secret",
		"https://example.com/#secret",
	]) {
		expect(businessContextSourceUrlsSchema.safeParse([url]).success).toBe(
			false
		);
	}
	expect(
		businessContextSourceUrlsSchema.safeParse(new Array(7).fill(urls[0]))
			.success
	).toBe(false);
});

test("research metadata stays bounded and old briefs remain valid", () => {
	expect(
		businessBriefSchema.parse({ content: "Existing brief", sources: [] })
	).toEqual({
		content: "Existing brief",
		sources: [],
	});
	const research = {
		startedAt: "2026-09-18T10:00:00.000Z",
		pages: [{ url: "https://example.com/", status: "read" }],
	};
	expect(businessContextResearchSchema.safeParse(research).success).toBe(true);
	expect(
		businessContextResearchSchema.safeParse({
			...research,
			pages: new Array(8).fill(research.pages[0]),
		}).success
	).toBe(false);
	expect(
		businessContextResearchSchema.safeParse({
			...research,
			pages: [{ url: "javascript:alert(1)", status: "failed" }],
		}).success
	).toBe(false);
	expect(
		businessContextFollowUpQuestionsSchema.safeParse([
			{
				field: "priority",
				question: "Which customer outcome matters most this month?",
			},
		]).success
	).toBe(true);
	for (const question of [
		{ field: "priority", question: " " },
		{ field: "priority", question: "a".repeat(301) },
		{ field: "content", question: "Overwrite the brief?" },
	]) {
		expect(
			businessContextFollowUpQuestionsSchema.safeParse([question]).success
		).toBe(false);
	}
});

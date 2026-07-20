import { describe, expect, test } from "bun:test";
import type { ToolSet } from "ai";
import { z } from "zod";
import { createToolkit } from "./toolkit";

const repository = { owner: "example", repo: "web-app" };

function schema(tools: ToolSet, name: string): z.ZodType {
	const input = tools[name]?.inputSchema;
	if (!input || !("safeParse" in input)) {
		throw new Error(`Missing Zod schema for ${name}`);
	}
	return input as z.ZodType;
}

function toolkit(githubRepository?: typeof repository | null): ToolSet {
	return createToolkit({
		capabilities: ["investigation"],
		githubRepository,
		organizationId: "org_1",
	});
}

describe("GitHub repository binding", () => {
	test("keeps generic tools when omitted and removes GitHub when disabled", () => {
		const generic = toolkit();
		expect(generic.github_repos).toBeDefined();
		expect(
			schema(generic, "github_commits").safeParse({
				owner: "example",
				repo: "web-app",
			}).success
		).toBe(true);

		const disabled = toolkit(null);
		expect(Object.keys(disabled).filter((name) => name.startsWith("github_"))).toEqual(
			[]
		);
	});

	test("bound tools omit repository discovery and reject cross-repo input", () => {
		const bound = toolkit(repository);
		expect(bound.github_repos).toBeUndefined();

		for (const name of Object.keys(bound).filter((key) => key.startsWith("github_"))) {
			const input = schema(bound, name);
			const json = z.toJSONSchema(input, { io: "input" });
			expect(json).not.toHaveProperty("properties.owner");
			expect(json).not.toHaveProperty("properties.repo");
			expect(
				input.safeParse({ owner: "other", repo: "escape" }).success
			).toBe(false);
		}
	});

	test("validates paths, commit SHAs, and search scope", () => {
		const bound = toolkit(repository);
		const readFile = schema(bound, "github_read_file");
		const commit = schema(bound, "github_commit_diff");
		const search = schema(bound, "github_search_code");
		const deploys = schema(bound, "github_deploys");

		expect(readFile.safeParse({ path: "src/index.ts" }).success).toBe(true);
		for (const path of ["../secret", "src/../secret", "/etc/passwd", "src\\secret"]) {
			expect(readFile.safeParse({ path }).success).toBe(false);
		}

		expect(commit.safeParse({ sha: "a1b2c3d" }).success).toBe(true);
		for (const sha of ["main", "a1b2c3", "../secret", "g1b2c3d"]) {
			expect(commit.safeParse({ sha }).success).toBe(false);
		}
		expect(
			deploys.safeParse({
				since: "2026-05-10T00:00:00Z",
				until: "2026-05-12T23:59:59Z",
			}).success
		).toBe(true);
		expect(deploys.safeParse({ until: "2026-05-12" }).success).toBe(false);
		expect(deploys.safeParse({ since: "not-a-date" }).success).toBe(false);
		expect(
			deploys.safeParse({
				since: "2026-05-13T00:00:00Z",
				until: "2026-05-12T23:59:59Z",
			}).success
		).toBe(false);

		expect(
			search.safeParse({ query: "handleCheckout language:typescript" }).success
		).toBe(true);
		for (const query of ["button repo:other/app", "org:other button", "user:other button"]) {
			expect(search.safeParse({ query }).success).toBe(false);
		}
	});
});

import { describe, expect, test } from "bun:test";
import type { ToolSet } from "ai";
import { z } from "zod";
import {
	createGitHubTools,
	type GitHubToolDependencies,
} from "./github-tools";
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

async function executeTool(
	tools: ToolSet,
	name: string,
	input: unknown
): Promise<unknown> {
	const execute = tools[name]?.execute as
		| ((value: unknown, options: unknown) => Promise<unknown> | unknown)
		| undefined;
	if (!execute) {
		throw new Error(`Missing executable tool ${name}`);
	}
	return execute(input, {});
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
		const pullRequests = schema(bound, "github_pull_requests");
		const pullRequest = schema(bound, "github_pull_request");

		expect(readFile.safeParse({ path: "src/index.ts" }).success).toBe(true);
		for (const path of ["../secret", "src/../secret", "/etc/passwd", "src\\secret"]) {
			expect(readFile.safeParse({ path }).success).toBe(false);
		}

		expect(commit.safeParse({ sha: "a1b2c3d" }).success).toBe(true);
		expect(
			commit.safeParse({ base: "a1b2c3d", sha: "d4e5f6a" }).success
		).toBe(true);
		for (const sha of ["main", "a1b2c3", "../secret", "g1b2c3d"]) {
			expect(commit.safeParse({ sha }).success).toBe(false);
			expect(commit.safeParse({ base: sha, sha: "a1b2c3d" }).success).toBe(
				false
			);
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

		expect(pullRequests.safeParse({ state: "open", limit: 10 }).success).toBe(
			true
		);
		expect(pullRequests.parse({})).toMatchObject({ state: "merged" });
		expect(pullRequests.safeParse({ state: "draft" }).success).toBe(false);
		expect(pullRequest.safeParse({ number: 1641 }).success).toBe(true);
		for (const number of [0, -1, 1.5]) {
			expect(pullRequest.safeParse({ number }).success).toBe(false);
		}
	});
});

describe("GitHub release and PR evidence", () => {
	test("preserves merged PR semantics and reports an incomplete scan", async () => {
		const calls: string[] = [];
		const tools = createGitHubTools(
			{ organizationId: "org_1", repository },
			{
				getToken: async () => "token",
				request: async (path) => {
					calls.push(path);
					return Array.from({ length: 100 }, (_, index) => ({
						base: { ref: "staging", sha: "a1b2c3d123" },
						draft: false,
						head: { sha: `d4e5f6a${String(index).padStart(3, "0")}` },
						html_url: `https://github.com/example/web-app/pull/${index + 1}`,
						labels: [],
						merged_at:
							index === 98
								? "2026-07-22T08:00:00Z"
								: index === 99
									? "2026-07-20T08:00:00Z"
									: null,
						number: index + 1,
						state: "closed",
						title: `PR ${index + 1}`,
						updated_at: "2026-07-23T08:00:00Z",
						user: null,
					}));
				},
			}
		);

		const result = await executeTool(tools, "github_pull_requests", {
			state: "merged",
			limit: 5,
		});

		expect(calls).toEqual([
			"/repos/example/web-app/pulls?state=closed&sort=updated&direction=desc&per_page=100",
		]);
		expect(result).toMatchObject({
			count: 2,
			truncated: true,
			pullRequests: [{ number: 99 }, { number: 100 }],
		});
	});

	test("compares exact deployed SHAs", async () => {
		const calls: string[] = [];
		const dependencies: GitHubToolDependencies = {
			getToken: async () => "token",
			request: async (path) => {
				calls.push(path);
				return {
					status: "ahead",
					ahead_by: 2,
					behind_by: 0,
					total_commits: 2,
					files: [
						{
							filename: "apps/dashboard/src/release.ts",
							status: "modified",
							additions: 4,
							deletions: 1,
						},
					],
				};
			},
		};
		const tools = createGitHubTools(
			{ organizationId: "org_1", repository },
			dependencies
		);

		const result = await executeTool(tools, "github_commit_diff", {
			base: "a1b2c3d",
			sha: "d4e5f6a",
		});

		expect(calls).toEqual([
			"/repos/example/web-app/compare/a1b2c3d...d4e5f6a",
		]);
		expect(result).toMatchObject({
			base: "a1b2c3d",
			head: "d4e5f6a",
			totalCommits: 2,
			files: [{ file: "apps/dashboard/src/release.ts" }],
		});
	});

	test("returns PR files and CI without source or log bodies", async () => {
		const calls: string[] = [];
		const dependencies: GitHubToolDependencies = {
			getToken: async () => "token",
			request: async (path) => {
				calls.push(path);
				if (path.endsWith("/files?per_page=30")) {
					return [
						{
							filename: "packages/db/src/client.ts",
							status: "modified",
							patch: "private source patch",
						},
						{
							filename: "apps/api/src/routes/billing.ts",
							status: "modified",
						},
					];
				}
				if (path.endsWith("/check-runs?per_page=50")) {
					return {
						total_count: 1,
						check_runs: [
							{
								name: "test",
								status: "completed",
								conclusion: "success",
								html_url: "https://github.com/example/web-app/checks/1",
								output: { text: "private check output" },
							},
						],
					};
				}
				if (path.endsWith("/status")) {
					return { state: "success" };
				}
				return {
					number: 1641,
					title: "fix(db): harden production Postgres reliability",
					body: "private PR body",
					state: "open",
					draft: true,
					html_url: "https://github.com/example/web-app/pull/1641",
					base: { sha: "a1b2c3d123" },
					head: {
						repo: { full_name: "example/web-app" },
						sha: "d4e5f6a123",
					},
					changed_files: 2,
				};
			},
		};
		const tools = createGitHubTools(
			{ organizationId: "org_1", repository },
			dependencies
		);

		const result = await executeTool(tools, "github_pull_request", {
			number: 1641,
		});

		expect(calls).toHaveLength(4);
		expect(result).toMatchObject({
			number: 1641,
			draft: true,
			filesTruncated: false,
			files: [
				{ path: "packages/db/src/client.ts" },
				{ path: "apps/api/src/routes/billing.ts" },
			],
			checks: [{ name: "test", conclusion: "success" }],
			commitStatus: "success",
		});
		expect(JSON.stringify(result)).not.toContain("private");
	});
});

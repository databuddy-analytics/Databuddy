import { tool } from "ai";
import { z } from "zod";
import { createCachedTokenFn } from "./utils/oauth-token";

const GITHUB_API = "https://api.github.com";
const MAX_RESULTS = 10;
const DEPLOY_FETCH_SIZE = 50;
const MAX_DEPLOY_PAGES = 5;
const MAX_COMMITS = 50;

interface GitHubDeploy {
	created_at: string;
	creator: { login: string } | null;
	description: string | null;
	environment: string;
	id: number;
	ref: string;
	sha: string;
}

export async function githubFetch(
	path: string,
	token: string
): Promise<unknown> {
	const res = await fetch(`${GITHUB_API}${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		signal: AbortSignal.timeout(10_000),
	});

	if (!res.ok) {
		return { error: `GitHub API ${res.status}: ${res.statusText}` };
	}

	return res.json();
}

export interface GitHubToolsParams {
	organizationId: string;
	userId?: string;
}

export function createGitHubTools(params: GitHubToolsParams) {
	const getToken = createCachedTokenFn(
		"github",
		params.organizationId,
		params.userId
	);

	const getRecentDeploysTool = tool({
		description:
			"Get recent GitHub deployments for a repo. Use when a metric changed and you want to check if a deploy happened in the same time window. Returns SHA, environment, timestamp, and author. Environment names vary by platform (e.g. 'Databuddy / production', 'api - preview'), so the environment filter matches as a case-insensitive substring; check availableEnvironments in the response if a filter returns nothing.",
		inputSchema: z.object({
			owner: z.string().describe("GitHub repo owner (user or org)"),
			repo: z.string().describe("GitHub repo name"),
			environment: z
				.string()
				.optional()
				.describe(
					"Case-insensitive substring filter on the environment name (e.g. 'production', 'preview')"
				),
			limit: z
				.number()
				.min(1)
				.max(MAX_RESULTS)
				.optional()
				.default(5)
				.describe("Number of deploys to return"),
		}),
		execute: async ({ owner, repo, environment, limit }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}

			const envNeedle = environment?.toLowerCase();
			const seenEnvironments = new Set<string>();
			const matched: GitHubDeploy[] = [];
			const maxPages = envNeedle ? MAX_DEPLOY_PAGES : 1;

			for (let page = 1; page <= maxPages; page++) {
				const data = await githubFetch(
					`/repos/${owner}/${repo}/deployments?per_page=${DEPLOY_FETCH_SIZE}&page=${page}`,
					token
				);

				if (data && typeof data === "object" && "error" in data) {
					return data;
				}

				const pageDeploys = data as GitHubDeploy[];
				for (const d of pageDeploys) {
					seenEnvironments.add(d.environment);
					if (!envNeedle || d.environment.toLowerCase().includes(envNeedle)) {
						matched.push(d);
					}
				}

				if (pageDeploys.length < DEPLOY_FETCH_SIZE || matched.length >= limit) {
					break;
				}
			}

			const availableEnvironments = [...seenEnvironments];

			return {
				repo: `${owner}/${repo}`,
				count: matched.length,
				availableEnvironments,
				deploys: matched.slice(0, limit).map((d) => ({
					sha: d.sha.slice(0, 7),
					ref: d.ref,
					environment: d.environment,
					deployedAt: d.created_at,
					description: d.description,
					author: d.creator?.login,
				})),
			};
		},
	});

	const getRecentCommitsTool = tool({
		description:
			"Get recent commits from a GitHub repo, optionally filtered by date range. Use when investigating what code changes happened around a metric anomaly. Returns commit message, author, and date, newest first. When correlating a multi-day window, set limit high enough to cover the whole window or pass until to page backwards; otherwise you only see the newest commits.",
		inputSchema: z.object({
			owner: z.string().describe("GitHub repo owner"),
			repo: z.string().describe("GitHub repo name"),
			since: z
				.string()
				.optional()
				.describe(
					"Only commits after this ISO date (e.g. 2026-05-15T00:00:00Z)"
				),
			until: z
				.string()
				.optional()
				.describe("Only commits before this ISO date"),
			limit: z
				.number()
				.min(1)
				.max(MAX_COMMITS)
				.optional()
				.default(30)
				.describe("Number of commits to return"),
		}),
		execute: async ({ owner, repo, since, until, limit }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}

			const queryParams = new URLSearchParams({ per_page: String(limit) });
			if (since) {
				queryParams.set("since", since);
			}
			if (until) {
				queryParams.set("until", until);
			}

			const data = await githubFetch(
				`/repos/${owner}/${repo}/commits?${queryParams}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const commits = data as Array<{
				sha: string;
				commit: {
					message: string;
					author: { name: string; date: string } | null;
				};
			}>;

			return {
				repo: `${owner}/${repo}`,
				count: commits.length,
				commits: commits.map((c) => ({
					sha: c.sha.slice(0, 7),
					message: c.commit.message.split("\n")[0].slice(0, 120),
					author: c.commit.author?.name,
					date: c.commit.author?.date,
				})),
			};
		},
	});

	const getRecentPullRequestsTool = tool({
		description:
			"Get recently merged PRs from a GitHub repo. Use when you found a deploy or commit that correlates with a metric change and want to understand what feature or fix was shipped. Returns PR title, merge date, and author.",
		inputSchema: z.object({
			owner: z.string().describe("GitHub repo owner"),
			repo: z.string().describe("GitHub repo name"),
			limit: z
				.number()
				.min(1)
				.max(MAX_RESULTS)
				.optional()
				.default(5)
				.describe("Number of PRs to return"),
		}),
		execute: async ({ owner, repo, limit }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}

			const data = await githubFetch(
				`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const prs = data as Array<{
				number: number;
				title: string;
				merged_at: string | null;
				user: { login: string } | null;
				labels: Array<{ name: string }>;
			}>;

			const merged = prs.filter((pr) => pr.merged_at);

			return {
				repo: `${owner}/${repo}`,
				count: merged.length,
				pullRequests: merged.map((pr) => ({
					number: pr.number,
					title: pr.title.slice(0, 120),
					mergedAt: pr.merged_at,
					author: pr.user?.login,
					labels: pr.labels.map((l) => l.name),
				})),
			};
		},
	});

	const listReposTool = tool({
		description:
			"List GitHub repos the connected account can access, sorted by last push. Call this first to find the repo name before querying deploys or commits.",
		inputSchema: z.object({
			limit: z
				.number()
				.min(1)
				.max(20)
				.optional()
				.default(10)
				.describe("Number of repos to return"),
		}),
		execute: async ({ limit }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}

			const data = await githubFetch(
				`/user/repos?sort=pushed&direction=desc&per_page=${limit}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const repos = data as Array<{
				full_name: string;
				private: boolean;
				pushed_at: string | null;
				default_branch: string;
			}>;

			return {
				count: repos.length,
				repos: repos.map((r) => ({
					name: r.full_name,
					private: r.private,
					lastPush: r.pushed_at,
					defaultBranch: r.default_branch,
				})),
			};
		},
	});

	const readFileTool = tool({
		description:
			"Read a file from a GitHub repo. Use to inspect source code when investigating a bug or tracking issue. Returns the file content as text.",
		inputSchema: z.object({
			owner: z.string(),
			repo: z.string(),
			path: z
				.string()
				.describe("File path in the repo (e.g. 'src/components/navbar.tsx')"),
			ref: z
				.string()
				.optional()
				.describe(
					"Branch, tag, or commit SHA. Defaults to the default branch."
				),
		}),
		execute: async ({ owner, repo, path, ref }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected" };
			}

			const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : "";
			const data = await githubFetch(
				`/repos/${owner}/${repo}/contents/${path}${refParam}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const file = data as {
				content?: string;
				encoding?: string;
				size?: number;
				name?: string;
			};
			if (!file.content || file.encoding !== "base64") {
				return { error: "File not found or not a regular file" };
			}

			const decoded = Buffer.from(file.content, "base64").toString("utf-8");
			return {
				path,
				size: file.size,
				content:
					decoded.length > 15_000
						? `${decoded.slice(0, 15_000)}\n…[truncated at 15KB]`
						: decoded,
			};
		},
	});

	const getCommitDiffTool = tool({
		description:
			"Get the diff for a specific commit. Use to see exactly what code changed. Returns the list of changed files with their patches.",
		inputSchema: z.object({
			owner: z.string(),
			repo: z.string(),
			sha: z.string().describe("Commit SHA (full or short)"),
		}),
		execute: async ({ owner, repo, sha }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected" };
			}

			const data = await githubFetch(
				`/repos/${owner}/${repo}/commits/${sha}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const commit = data as {
				sha: string;
				commit: {
					message: string;
					author: { name: string; date: string } | null;
				};
				files?: Array<{
					filename: string;
					status: string;
					additions: number;
					deletions: number;
					patch?: string;
				}>;
			};

			const files = (commit.files ?? []).map((f) => ({
				file: f.filename,
				status: f.status,
				additions: f.additions,
				deletions: f.deletions,
				patch: f.patch?.slice(0, 3000),
			}));

			return {
				sha: commit.sha.slice(0, 7),
				message: commit.commit.message.split("\n")[0],
				author: commit.commit.author?.name,
				date: commit.commit.author?.date,
				filesChanged: files.length,
				files,
			};
		},
	});

	const searchCodeTool = tool({
		description:
			"Search for code in a GitHub repo. Use to find where a function, event name, or component is defined or used.",
		inputSchema: z.object({
			owner: z.string(),
			repo: z.string(),
			query: z
				.string()
				.describe(
					"Search query (e.g. 'navbar-nav-click' or 'function handleCheckout')"
				),
		}),
		execute: async ({ owner, repo, query }) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected" };
			}

			const data = await githubFetch(
				`/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}&per_page=10`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const result = data as {
				total_count: number;
				items: Array<{ name: string; path: string; html_url: string }>;
			};

			return {
				totalResults: result.total_count,
				matches: result.items.map((i) => ({
					file: i.path,
					name: i.name,
				})),
			};
		},
	});

	return {
		github_commits: getRecentCommitsTool,
		github_commit_diff: getCommitDiffTool,
		github_deploys: getRecentDeploysTool,
		github_pull_requests: getRecentPullRequestsTool,
		github_read_file: readFileTool,
		github_repos: listReposTool,
		github_search_code: searchCodeTool,
	};
}

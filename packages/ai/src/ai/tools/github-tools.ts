import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createCachedTokenFn } from "./utils/oauth-token";

const GITHUB_API = "https://api.github.com";
const MAX_RESULTS = 10;
const DEPLOY_FETCH_SIZE = 50;
const MAX_DEPLOY_PAGES = 5;
const MAX_COMMITS = 50;
const SEARCH_SCOPE = /\b(?:repo|org|user):\S+/i;
const DEPLOYMENT_RESULT_STATES = new Set(["error", "failure", "success"]);
const DEPLOYMENT_TIMESTAMP = z
	.string()
	.datetime({ offset: true })
	.describe("ISO timestamp with timezone, for example 2026-05-12T23:59:59Z");
const REPOSITORY_FIELDS = {
	owner: z.string().min(1).describe("GitHub repo owner (user or org)"),
	repo: z.string().min(1).describe("GitHub repo name"),
};
const REPOSITORY_PATH = z
	.string()
	.min(1)
	.max(1000)
	.refine(
		(path) =>
			!(path.startsWith("/") || path.includes("\\")) &&
			path.split("/").every((part) => part && part !== "." && part !== ".."),
		"Use a repository-relative file path without traversal segments"
	);
const COMMIT_SHA = z
	.string()
	.regex(/^[0-9a-f]{7,40}$/i, "Use a 7-40 character commit SHA");
const PULL_REQUEST_NUMBER = z.number().int().positive().max(10_000_000);
const CODE_QUERY = z
	.string()
	.trim()
	.min(1)
	.max(256)
	.refine(
		(query) => !SEARCH_SCOPE.test(query),
		"Repository, organization, and user scope qualifiers are not allowed"
	);

interface GitHubDeploy {
	created_at: string;
	creator: { login: string } | null;
	description: string | null;
	environment: string;
	id: number;
	ref: string;
	sha: string;
}

interface GitHubDeploymentStatus {
	created_at: string;
	description: string | null;
	environment_url: string | null;
	log_url: string | null;
	state: string;
	updated_at: string;
}

async function githubFetch(path: string, token: string): Promise<unknown> {
	try {
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

		return await res.json();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { error: `GitHub request failed: ${message.slice(0, 200)}` };
	}
}

function githubApiError(value: unknown): string | null {
	if (
		value &&
		typeof value === "object" &&
		"error" in value &&
		typeof value.error === "string"
	) {
		return value.error;
	}
	return null;
}

export interface GitHubToolsParams {
	organizationId: string;
	repository?: GitHubRepository | null;
	userId?: string;
}

export interface GitHubRepository {
	owner: string;
	repo: string;
}

export interface GitHubToolDependencies {
	getToken?: () => Promise<string | null>;
	request?: (path: string, token: string) => Promise<unknown>;
}

function createRepositorySchema<T extends z.ZodRawShape>(
	repository: GitHubRepository | undefined,
	shape: T
) {
	if (repository) {
		return z.object(shape).strict();
	}
	return z.object({ ...REPOSITORY_FIELDS, ...shape });
}

function resolveRepository(
	repository: GitHubRepository | undefined,
	input: unknown
): GitHubRepository {
	if (repository) {
		return repository;
	}
	if (
		input &&
		typeof input === "object" &&
		"owner" in input &&
		"repo" in input &&
		typeof input.owner === "string" &&
		typeof input.repo === "string"
	) {
		return { owner: input.owner, repo: input.repo };
	}
	throw new Error("GitHub repository is required");
}

function repositoryPath(repository: GitHubRepository): string {
	return `${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
}

function filePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

export function createGitHubTools(
	params: GitHubToolsParams,
	dependencies: GitHubToolDependencies = {}
): ToolSet {
	if (params.repository === null) {
		return {};
	}

	const repository = params.repository;
	const getToken =
		dependencies.getToken ??
		createCachedTokenFn("github", params.organizationId, params.userId, "repo");
	const request = dependencies.request ?? githubFetch;
	const deploymentInput = createRepositorySchema(repository, {
		environment: z
			.string()
			.optional()
			.describe(
				"Case-insensitive substring filter on the environment name (e.g. 'production', 'preview')"
			),
		since: DEPLOYMENT_TIMESTAMP.optional().describe(
			"Only deployments requested on or after this timestamp"
		),
		until: DEPLOYMENT_TIMESTAMP.optional().describe(
			"Only deployments requested on or before this timestamp"
		),
		limit: z
			.number()
			.min(1)
			.max(MAX_RESULTS)
			.optional()
			.default(5)
			.describe("Number of deploys to return"),
	}).superRefine((input, context) => {
		if (
			input.since &&
			input.until &&
			Date.parse(input.since) > Date.parse(input.until)
		) {
			context.addIssue({
				code: "custom",
				message: "since must be before or equal to until",
				path: ["until"],
			});
		}
	});

	const getRecentDeploysTool = tool({
		description:
			"Get GitHub deployments around a metric change. since/until filter the request time and require exact timestamps. Returns the successful or failed completion separately from the current state, because old preview deployments may later become inactive. If truncated is true, the requested history was older than the scanned window and absence is not evidence that no deploy occurred.",
		inputSchema: deploymentInput,
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}
			const repo = resolveRepository(repository, input);

			const envNeedle = input.environment?.toLowerCase();
			const since = input.since ? Date.parse(input.since) : null;
			const until = input.until ? Date.parse(input.until) : null;
			const seenEnvironments = new Set<string>();
			const matched: GitHubDeploy[] = [];
			let oldestScannedAt: string | null = null;
			let truncated = false;
			const maxPages =
				envNeedle || since !== null || until !== null ? MAX_DEPLOY_PAGES : 1;

			for (let page = 1; page <= maxPages; page++) {
				const data = await request(
					`/repos/${repositoryPath(repo)}/deployments?per_page=${DEPLOY_FETCH_SIZE}&page=${page}`,
					token
				);

				if (data && typeof data === "object" && "error" in data) {
					return data;
				}

				const pageDeploys = data as GitHubDeploy[];
				oldestScannedAt = pageDeploys.at(-1)?.created_at ?? oldestScannedAt;
				for (const d of pageDeploys) {
					seenEnvironments.add(d.environment);
					const requestedAt = Date.parse(d.created_at);
					if (
						(!envNeedle || d.environment.toLowerCase().includes(envNeedle)) &&
						(since === null || requestedAt >= since) &&
						(until === null || requestedAt <= until)
					) {
						matched.push(d);
					}
				}

				const crossedSince =
					since !== null &&
					oldestScannedAt !== null &&
					Date.parse(oldestScannedAt) < since;
				if (
					pageDeploys.length < DEPLOY_FETCH_SIZE ||
					matched.length >= input.limit ||
					crossedSince
				) {
					break;
				}
				if (page === maxPages) {
					truncated = true;
				}
			}

			const availableEnvironments = [...seenEnvironments];
			const statusResults = await Promise.all(
				matched.slice(0, input.limit).map(async (deployment) => {
					const statuses = await request(
						`/repos/${repositoryPath(repo)}/deployments/${deployment.id}/statuses?per_page=10`,
						token
					);
					if (!Array.isArray(statuses)) {
						return { deployment, error: statuses };
					}
					return { deployment, statuses: statuses as GitHubDeploymentStatus[] };
				})
			);
			const failedStatus = statusResults.find((result) => "error" in result);
			if (failedStatus && "error" in failedStatus) {
				return failedStatus.error;
			}
			const deployments = statusResults.map((result) => {
				const deployment = result.deployment;
				const statuses =
					"statuses" in result && result.statuses ? result.statuses : [];
				const current = statuses[0];
				const completed = statuses.find((status) =>
					DEPLOYMENT_RESULT_STATES.has(status.state)
				);
				return {
					sha: deployment.sha,
					ref: deployment.ref,
					environment: deployment.environment,
					requestedAt: deployment.created_at,
					description: deployment.description,
					author: deployment.creator?.login,
					result: completed?.state ?? null,
					completedAt: completed?.created_at ?? null,
					currentState: current?.state ?? null,
					currentStateAt: current?.created_at ?? null,
					statusDescription:
						completed?.description ?? current?.description ?? null,
					environmentUrl:
						completed?.environment_url ?? current?.environment_url ?? null,
					logUrl: completed?.log_url ?? current?.log_url ?? null,
				};
			});

			return {
				repo: `${repo.owner}/${repo.repo}`,
				count: deployments.length,
				availableEnvironments,
				deployments,
				oldestScannedAt,
				truncated,
			};
		},
	});

	const getRecentCommitsTool = tool({
		description:
			"Get recent commits from a GitHub repo, optionally filtered by date range. Use when investigating what code changes happened around a metric anomaly. Returns commit message, author, and date, newest first. When correlating a multi-day window, set limit high enough to cover the whole window or pass until to page backwards; otherwise you only see the newest commits.",
		inputSchema: createRepositorySchema(repository, {
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
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}
			const repo = resolveRepository(repository, input);

			const queryParams = new URLSearchParams({
				per_page: String(input.limit),
			});
			if (input.since) {
				queryParams.set("since", input.since);
			}
			if (input.until) {
				queryParams.set("until", input.until);
			}

			const data = await request(
				`/repos/${repositoryPath(repo)}/commits?${queryParams}`,
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
				repo: `${repo.owner}/${repo.repo}`,
				count: commits.length,
				commits: commits.map((c) => ({
					sha: c.sha,
					message: c.commit.message.split("\n")[0].slice(0, 120),
					author: c.commit.author?.name,
					date: c.commit.author?.date,
				})),
			};
		},
	});

	const getRecentPullRequestsTool = tool({
		description:
			"List recent merged, open, closed, or all pull requests. Defaults to merged for shipped-change investigations. Use open PRs to check whether active work covers an issue; a title is not proof of coverage.",
		inputSchema: createRepositorySchema(repository, {
			state: z
				.enum(["merged", "open", "closed", "all"])
				.optional()
				.default("merged")
				.describe("Pull request state to list"),
			limit: z
				.number()
				.min(1)
				.max(MAX_RESULTS)
				.optional()
				.default(5)
				.describe("Number of PRs to return"),
		}),
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}
			const repo = resolveRepository(repository, input);
			const apiState = input.state === "merged" ? "closed" : input.state;

			const scanLimit = input.state === "merged" ? 100 : input.limit;
			const data = await request(
				`/repos/${repositoryPath(repo)}/pulls?state=${apiState}&sort=updated&direction=desc&per_page=${scanLimit}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			const prs = data as Array<{
				base: { ref: string; sha: string };
				draft: boolean;
				head: { sha: string };
				html_url: string;
				merged_at: string | null;
				number: number;
				state: "open" | "closed";
				title: string;
				updated_at: string;
				user: { login: string } | null;
				labels: Array<{ name: string }>;
			}>;

			const matching =
				input.state === "merged"
					? prs
							.filter((pr) => pr.merged_at)
							.sort(
								(a, b) =>
									Date.parse(b.merged_at ?? "") - Date.parse(a.merged_at ?? "")
							)
					: prs;
			const pullRequests = matching.slice(0, input.limit);
			return {
				repo: `${repo.owner}/${repo.repo}`,
				count: pullRequests.length,
				truncated: prs.length === scanLimit,
				pullRequests: pullRequests.map((pr) => ({
					number: pr.number,
					title: pr.title.slice(0, 120),
					state: pr.state,
					draft: pr.draft,
					mergedAt: pr.merged_at,
					updatedAt: pr.updated_at,
					author: pr.user?.login,
					labels: pr.labels.map((l) => l.name),
					headSha: pr.head.sha,
					base: pr.base.ref,
					baseSha: pr.base.sha,
					url: pr.html_url,
				})),
			};
		},
	});

	const getPullRequestTool = tool({
		description:
			"Inspect one pull request's changed files and checks. Use after listing a potentially relevant PR. Coverage is full only when inspected changes address every evidenced failure surface; compare its base and head SHAs when file names alone are insufficient. Missing or truncated evidence means coverage or CI is unknown.",
		inputSchema: createRepositorySchema(repository, {
			number: PULL_REQUEST_NUMBER.describe("Pull request number"),
		}),
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected for this organization" };
			}
			const repo = resolveRepository(repository, input);
			const path = repositoryPath(repo);
			const data = await request(`/repos/${path}/pulls/${input.number}`, token);
			if (data && typeof data === "object" && "error" in data) {
				return data;
			}
			const pullRequest = data as {
				base: { sha: string };
				changed_files: number;
				draft: boolean;
				head: {
					repo: { full_name: string } | null;
					sha: string;
				};
				html_url: string;
				number: number;
				state: "open" | "closed";
				title: string;
			};
			const [filesData, checksData, statusData] = await Promise.all([
				request(
					`/repos/${path}/pulls/${input.number}/files?per_page=30`,
					token
				),
				request(
					`/repos/${path}/commits/${pullRequest.head.sha}/check-runs?per_page=50`,
					token
				),
				request(`/repos/${path}/commits/${pullRequest.head.sha}/status`, token),
			]);
			const files = Array.isArray(filesData)
				? (
						filesData as Array<{
							filename: string;
							status: string;
						}>
					).map((file) => ({
						path: file.filename,
						status: file.status,
					}))
				: [];
			const checks =
				checksData &&
				typeof checksData === "object" &&
				"check_runs" in checksData &&
				Array.isArray(checksData.check_runs)
					? (
							checksData.check_runs as Array<{
								conclusion: string | null;
								name: string;
								status: string;
							}>
						).map((check) => ({
							name: check.name,
							status: check.status,
							conclusion: check.conclusion,
						}))
					: [];
			const totalChecks =
				checksData &&
				typeof checksData === "object" &&
				"total_count" in checksData &&
				typeof checksData.total_count === "number"
					? checksData.total_count
					: null;
			const repoName = `${repo.owner}/${repo.repo}`;
			const headRepo = pullRequest.head.repo?.full_name ?? null;
			const fromFork =
				headRepo !== null && headRepo.toLowerCase() !== repoName.toLowerCase();
			const commitStatus =
				statusData &&
				typeof statusData === "object" &&
				"state" in statusData &&
				typeof statusData.state === "string"
					? statusData.state
					: null;
			return {
				repo: repoName,
				number: pullRequest.number,
				title: pullRequest.title,
				state: pullRequest.state,
				draft: pullRequest.draft,
				url: pullRequest.html_url,
				baseSha: pullRequest.base.sha,
				headSha: pullRequest.head.sha,
				headRepo,
				fromFork,
				changedFiles: pullRequest.changed_files,
				files,
				filesTruncated:
					!Array.isArray(filesData) || files.length < pullRequest.changed_files,
				filesError: githubApiError(filesData),
				checks,
				checksTruncated:
					fromFork || totalChecks === null || checks.length < totalChecks,
				checksError: githubApiError(checksData),
				commitStatus,
				commitStatusError: githubApiError(statusData),
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

			const data = await request(
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
		inputSchema: createRepositorySchema(repository, {
			path: REPOSITORY_PATH.describe(
				"File path in the repo (e.g. 'src/components/navbar.tsx')"
			),
			ref: z
				.string()
				.optional()
				.describe(
					"Branch, tag, or commit SHA. Defaults to the default branch."
				),
		}),
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected" };
			}
			const repo = resolveRepository(repository, input);

			const refParam = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
			const data = await request(
				`/repos/${repositoryPath(repo)}/contents/${filePath(input.path)}${refParam}`,
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
				path: input.path,
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
			"Get one commit with patches, or compare changed files between two exact deployed SHAs by passing base. A comparison can rule out untouched files; inspect relevant source at base and head before attributing a failure to changed code.",
		inputSchema: createRepositorySchema(repository, {
			base: COMMIT_SHA.optional().describe(
				"Earlier deployed SHA to compare against"
			),
			sha: COMMIT_SHA.describe("Commit SHA (full or short)"),
		}),
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected" };
			}
			const repo = resolveRepository(repository, input);

			const data = await request(
				input.base
					? `/repos/${repositoryPath(repo)}/compare/${input.base}...${input.sha}`
					: `/repos/${repositoryPath(repo)}/commits/${input.sha}`,
				token
			);

			if (data && typeof data === "object" && "error" in data) {
				return data;
			}

			if (input.base) {
				const comparison = data as {
					ahead_by: number;
					behind_by: number;
					files?: Array<{
						additions: number;
						deletions: number;
						filename: string;
						status: string;
					}>;
					status: string;
					total_commits: number;
				};
				return {
					repo: `${repo.owner}/${repo.repo}`,
					base: input.base,
					head: input.sha,
					status: comparison.status,
					aheadBy: comparison.ahead_by,
					behindBy: comparison.behind_by,
					totalCommits: comparison.total_commits,
					files: (comparison.files ?? []).map((file) => ({
						file: file.filename,
						status: file.status,
						additions: file.additions,
						deletions: file.deletions,
					})),
					filesMayBeTruncated: (comparison.files?.length ?? 0) >= 300,
				};
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
				sha: commit.sha,
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
		inputSchema: createRepositorySchema(repository, {
			query: CODE_QUERY.describe(
				"Search query (e.g. 'navbar-nav-click' or 'function handleCheckout')"
			),
		}),
		execute: async (input) => {
			const token = await getToken();
			if (!token) {
				return { error: "No GitHub account connected" };
			}
			const repo = resolveRepository(repository, input);

			const data = await request(
				`/search/code?q=${encodeURIComponent(input.query)}+repo:${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}&per_page=10`,
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

	const tools: ToolSet = {
		github_commits: getRecentCommitsTool,
		github_commit_diff: getCommitDiffTool,
		github_deploys: getRecentDeploysTool,
		github_pull_request: getPullRequestTool,
		github_pull_requests: getRecentPullRequestsTool,
		github_read_file: readFileTool,
		github_search_code: searchCodeTool,
	};

	if (!repository) {
		tools.github_repos = listReposTool;
	}

	return tools;
}

import { spawnSync } from "node:child_process";

const RELEASE_BRANCH_PREFIX = "release/staging-to-main-";
const ISO_MILLISECONDS = /\.\d{3}Z$/u;
const ISO_SEPARATORS = /[-:]/gu;
const create = process.argv.includes("--create");

function run(command: string[]): string {
	const result = spawnSync(command[0], command.slice(1), {
		encoding: "utf8",
	});
	const stdout = result.stdout?.trim() ?? "";
	const stderr = result.stderr?.trim() ?? "";

	if (result.error || result.status !== 0) {
		throw new Error(
			`Command failed: ${command.join(" ")}\n${stderr || stdout || result.error?.message}`
		);
	}

	return stdout;
}

function releaseBranchName() {
	return `${RELEASE_BRANCH_PREFIX}${new Date()
		.toISOString()
		.replaceAll(ISO_SEPARATORS, "")
		.replace(ISO_MILLISECONDS, "Z")}`;
}

interface PullRequest {
	headRefName: string;
	number: number;
	url: string;
}

run(["git", "fetch", "origin", "main", "staging"]);

const repository = run([
	"gh",
	"repo",
	"view",
	"--json",
	"nameWithOwner",
	"--jq",
	".nameWithOwner",
]);
const mainSha = run(["git", "rev-parse", "origin/main"]);
const stagingSha = run(["git", "rev-parse", "origin/staging"]);

if (mainSha === stagingSha) {
	console.log("staging already matches main; no release PR is needed.");
	process.exit(0);
}

run(["git", "merge-base", "--is-ancestor", "origin/main", "origin/staging"]);

const openPullRequests = JSON.parse(
	run([
		"gh",
		"pr",
		"list",
		"--repo",
		repository,
		"--base",
		"main",
		"--state",
		"open",
		"--json",
		"headRefName,number,url",
	])
) as PullRequest[];
const existingRelease = openPullRequests.find(
	(pullRequest) =>
		pullRequest.headRefName === "staging" ||
		pullRequest.headRefName.startsWith(RELEASE_BRANCH_PREFIX)
);

if (existingRelease) {
	throw new Error(
		`An open staging promotion already exists: ${existingRelease.url}. Merge or close it before preparing another release.`
	);
}

const branch = releaseBranchName();

if (!create) {
	console.log(`Release source: ${stagingSha}`);
	console.log(`Release branch: ${branch}`);
	console.log(
		"Dry run only. Re-run with --create to push the disposable release branch and open the main PR."
	);
	process.exit(0);
}

run(["git", "push", "origin", `${stagingSha}:refs/heads/${branch}`]);

const pullRequestBody = [
	`Promotes staging commit ${stagingSha} through a disposable release branch`,
	"so GitHub may delete the merged PR head without deleting staging.",
].join(" ");
const pullRequestUrl = run([
	"gh",
	"pr",
	"create",
	"--repo",
	repository,
	"--base",
	"main",
	"--head",
	branch,
	"--title",
	"release: promote staging to main",
	"--body",
	pullRequestBody,
]);

console.log(`Release PR created: ${pullRequestUrl}`);

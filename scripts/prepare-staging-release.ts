import { spawnSync } from "bun";

const RELEASE_BRANCH_PREFIX = "release/staging-to-main-";
const RELEASE_BRANCH_SHA_LENGTH = 12;
const GIT_SUFFIX = /\.git$/u;
const GITHUB_ORIGIN =
	/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(?<repository>[^/]+\/[^/]+)$/u;
const create = process.argv.includes("--create");

const decoder = new TextDecoder();

function execute(command: string[]) {
	const result = spawnSync(command, {
		stderr: "pipe",
		stdout: "pipe",
	});

	return {
		stderr: decoder.decode(result.stderr).trim(),
		stdout: decoder.decode(result.stdout).trim(),
		success: result.success,
	};
}

function run(command: string[]): string {
	const result = execute(command);

	if (!result.success) {
		throw new Error(
			`Command failed: ${command.join(" ")}\n${result.stderr || result.stdout}`
		);
	}

	return result.stdout;
}

function output(message: string) {
	process.stdout.write(`${message}\n`);
}

function originRepository() {
	const origin = run(["git", "remote", "get-url", "origin"]).replace(
		GIT_SUFFIX,
		""
	);
	const repository = origin.match(GITHUB_ORIGIN)?.groups?.repository;

	if (!repository) {
		throw new Error(
			`origin must be a github.com repository URL; received ${origin}`
		);
	}

	return repository;
}

function releaseBranchName(stagingSha: string) {
	return `${RELEASE_BRANCH_PREFIX}${stagingSha.slice(0, RELEASE_BRANCH_SHA_LENGTH)}`;
}

function openReleasePullRequest(repository: string) {
	const promotion = run([
		"gh",
		"pr",
		"list",
		"--repo",
		repository,
		"--state",
		"open",
		"--base",
		"main",
		"--limit",
		"1000",
		"--json",
		"headRefName,headRepository,url",
		"--jq",
		`[.[] | select(.headRepository.nameWithOwner? == "${repository}") | select(.headRefName == "staging" or (.headRefName | startswith("${RELEASE_BRANCH_PREFIX}")))][0] | select(.) | [.headRefName, .url] | @tsv`,
	]);

	if (!promotion) {
		return;
	}

	const [promotionBranch, promotionUrl] = promotion.split("\t");

	if (!(promotionBranch && promotionUrl)) {
		throw new Error("GitHub returned an invalid open release promotion.");
	}

	return { branch: promotionBranch, url: promotionUrl };
}

function verifyNoConflictingRelease(repository: string, branch: string) {
	const existingPromotion = openReleasePullRequest(repository);

	if (existingPromotion && existingPromotion.branch !== branch) {
		throw new Error(
			`An open staging promotion already exists: ${existingPromotion.url}. Merge or close it before preparing another release.`
		);
	}

	return existingPromotion;
}

run(["git", "fetch", "origin", "main", "staging"]);

const repository = originRepository();
const mainSha = run(["git", "rev-parse", "origin/main"]);
const stagingSha = run(["git", "rev-parse", "origin/staging"]);

if (mainSha === stagingSha) {
	output("staging already matches main; no release PR is needed.");
	process.exit(0);
}

run(["git", "merge-base", "--is-ancestor", "origin/main", "origin/staging"]);

const branch = releaseBranchName(stagingSha);
const existingRelease = verifyNoConflictingRelease(repository, branch);

if (existingRelease) {
	output(
		`A promotion for this staging commit is already open: ${existingRelease.url}`
	);
	process.exit(0);
}

if (!create) {
	output(`Release source: ${stagingSha}`);
	output(`Release branch: ${branch}`);
	output(
		"Dry run only. Re-run with --create to push the disposable release branch and open the main PR."
	);
	process.exit(0);
}

run(["git", "push", "origin", `${stagingSha}:refs/heads/${branch}`]);

const pullRequestBody = [
	`Promotes staging commit ${stagingSha} through a disposable release branch`,
	"so GitHub may delete the merged PR head without deleting staging.",
].join(" ");
const createPullRequest = execute([
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

if (createPullRequest.success) {
	output(`Release PR created: ${createPullRequest.stdout}`);
	process.exit(0);
}

const concurrentRelease = openReleasePullRequest(repository);

if (concurrentRelease?.branch === branch) {
	output(
		`A concurrent promotion already created this release PR: ${concurrentRelease.url}`
	);
	process.exit(0);
}

if (concurrentRelease) {
	throw new Error(
		`Another staging promotion is already open: ${concurrentRelease.url}. The deterministic branch ${branch} remains reusable on retry.`
	);
}

throw new Error(
	`Unable to create a release PR. The deterministic branch ${branch} remains reusable on retry.\n${createPullRequest.stderr || createPullRequest.stdout}`
);

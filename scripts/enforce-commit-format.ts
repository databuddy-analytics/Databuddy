import { readFileSync } from "node:fs";

const messagePath = process.argv[2];
if (!messagePath) {
	console.error("Missing commit message path");
	process.exit(1);
}

const line = readFileSync(messagePath, "utf8").split(/\r?\n/, 1)[0] ?? "";
const ok =
	/^(feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)\(.+\): .+/.test(
		line
	);

if (!ok) {
	console.error("Commit message must match: <type>(<scope>): <description>");
	process.exit(1);
}

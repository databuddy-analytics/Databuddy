import { expect, test } from "bun:test";

test.each([
	[undefined, "https://status.databuddy.cc/example"],
	["", null],
	["https://status.example.com", "https://status.example.com/example"],
] as const)("status links with URL %s", (url, expected) => {
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"-e",
			'import { getStatusPageUrl } from "./app-url"; console.log(JSON.stringify(getStatusPageUrl("example")));',
		],
		cwd: import.meta.dir,
		env: {
			...process.env,
			NODE_ENV: "production",
			SELFHOST: "false",
			NEXT_PUBLIC_SELFHOST: "false",
			STATUS_URL: "",
			NEXT_PUBLIC_STATUS_URL: url,
		},
	});
	expect(result.exitCode).toBe(0);
	expect(JSON.parse(result.stdout.toString())).toBe(expected);
});

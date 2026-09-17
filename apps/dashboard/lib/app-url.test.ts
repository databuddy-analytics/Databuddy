import { expect, test } from "bun:test";

test.each([
	[false, undefined, "https://status.databuddy.cc/example"],
	[false, "", "https://status.databuddy.cc/example"],
	[true, undefined, null],
	[true, "", null],
	[true, "  ", null],
	[true, "https://status.example.com", "https://status.example.com/example"],
	[false, "https://status.example.com", "https://status.example.com/example"],
] as const)("status links with self-host=%s and URL %s", (selfhost, url, expected) => {
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
			SELFHOST: String(selfhost),
			NEXT_PUBLIC_SELFHOST: String(selfhost),
			STATUS_URL: "",
			NEXT_PUBLIC_STATUS_URL: url,
		},
	});
	expect(result.exitCode).toBe(0);
	expect(JSON.parse(result.stdout.toString())).toBe(expected);
});

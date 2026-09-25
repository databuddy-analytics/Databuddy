import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, test } from "bun:test";

interface Captured {
	body: {
		segments?: unknown[];
		state?: unknown;
		providerOptions?: { gateway: { zeroDataRetention: boolean } };
	};
	headers: Record<string, string>;
	mode: string;
	sequence: number;
	url: string;
}
interface Summary {
	cachedBatches: number;
	classifiedFiles: number;
	interrupted: boolean;
	requestAttempts: number;
}

const packageDir = dirname(fileURLToPath(import.meta.url));
const scanner = join(packageDir, "dist/cli.js");
const mockFetch = `import {appendFileSync} from 'node:fs';
let sequence=0;
globalThis.fetch=async(url,options)=>{
 const mode=process.env.SCAN_TEST_MODE;
 if(mode==='forbid')throw Error('NETWORK_FORBIDDEN');
 const body=JSON.parse(options.body);
 appendFileSync(process.env.SCAN_TEST_CAPTURE,JSON.stringify({mode,sequence:++sequence,url,headers:options.headers,body})+'\\n');
 if(mode==='retry-once'&&sequence===1)return Response.json({error:{message:'DO_NOT_LOG_PROVIDER_BODY'}},{status:503});
 if(mode==='interrupt'&&sequence>1)return new Promise((_,reject)=>{const alive=setTimeout(()=>reject(Error('Mock wait expired')),10000);const abort=()=>{clearTimeout(alive);reject(options.signal.reason)};if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});
 const answers={};const segments=body.state?.segments??body.segments;
 for(let i=0;i<segments.length;i++){answers['coverage_'+i]={choice:'missing',probabilities:{missing:1}};answers['category_'+i]={choice:'activation',probabilities:{activation:1}};answers['priority_'+i]={score:2};}
 return Response.json({answers,usage:{inputTokens:10,outputTokens:5}});
};\n`;
const markers = {
	source: "SYNTHETIC_PRODUCT_SOURCE",
	env: "ENV_CONTENT_MARKER",
	secret: "EMBEDDED_SECRET_MARKER",
	outside: "OUTSIDE_SOURCE_MARKER",
	ancestor: "ANCESTOR_SOURCE_MARKER",
	sibling: "SIBLING_FOLDER_MARKER",
};
let temporary = "",
	repo = "",
	preload = "",
	capture = "";

function git(cwd: string, ...args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
}
function cli(
	args: string[],
	{
		mode = "forbid",
		key = "synthetic-key-no-network",
		cache = "cache",
		status = 0,
		runtime = "node",
	} = {}
) {
	const result = spawnSync(
		runtime,
		[runtime === "bun" ? "--preload" : "--import", preload, scanner, ...args],
		{
			cwd: temporary,
			encoding: "utf8",
			timeout: 20_000,
			env: {
				PATH: process.env.PATH,
				TERM: "dumb",
				NO_COLOR: "1",
				XDG_CACHE_HOME: join(temporary, cache),
				SCAN_TEST_MODE: mode,
				SCAN_TEST_CAPTURE: capture,
				...(key ? { AI_GATEWAY_API_KEY: key } : {}),
			},
		}
	);
	assert.equal(
		result.status,
		status,
		`${args.join(" ")}:\n${result.stderr}\n${result.stdout}`
	);
	assert.ok(
		!result.stdout.includes("\x1b"),
		"Output contains terminal controls"
	);
	return result;
}
async function requests(): Promise<Captured[]> {
	const text = await readFile(capture, "utf8").catch(() => "");
	return text
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Captured);
}
function button(name: string, marker = "") {
	return `export function ${name}() { return <button onClick={() => api.${name.toLowerCase()}.mutate("${marker}")}>${name}</button>; }\n`;
}

beforeAll(async () => {
	temporary = await mkdtemp(join(tmpdir(), "databuddy-scan-test-"));
	preload = join(temporary, "mock-fetch.mjs");
	capture = join(temporary, "requests.ndjson");
	await writeFile(preload, mockFetch);
	repo = await realpath(await mkdtemp(join(temporary, "repo-")));
	await mkdir(join(repo, "src/app"), { recursive: true });
	await mkdir(join(repo, "src/admin"), { recursive: true });
	await mkdir(join(repo, "src/nested"));
	await writeFile(
		join(repo, "src/app/checkout.tsx"),
		button("Buy", markers.source)
	);
	await writeFile(join(repo, "src/app/settings.tsx"), button("Save"));
	await writeFile(
		join(repo, "src/admin/ban.tsx"),
		button("Ban", markers.sibling)
	);
	await writeFile(join(repo, ".env"), `DO_NOT_SEND=${markers.env}\n`);
	await writeFile(
		join(repo, "src/app/keys.tsx"),
		`export const key = "sk_live_${"S".repeat(32)}"; // ${markers.secret}\n${button("Rotate")}`
	);
	await writeFile(
		join(temporary, "external.tsx"),
		button("Leak", markers.outside)
	);
	await symlink(
		join(temporary, "external.tsx"),
		join(repo, "src/app/linked.tsx")
	);
	await writeFile(
		join(repo, "src/nested/page.tsx"),
		"export const before = true;\n"
	);
	git(repo, "init", "--quiet");
	git(repo, "add", ".");
	git(
		repo,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.com",
		"-c",
		"commit.gpgsign=false",
		"-c",
		"core.hooksPath=/dev/null",
		"commit",
		"--quiet",
		"-m",
		"fixture"
	);
	await mkdir(join(temporary, "redirect"));
	await writeFile(
		join(temporary, "redirect/page.tsx"),
		button("Hop", markers.ancestor)
	);
	await rm(join(repo, "src/nested"), { recursive: true });
	await symlink(join(temporary, "redirect"), join(repo, "src/nested"));
});

afterAll(async () => {
	await rm(temporary, { recursive: true, force: true });
});

test("the dry-run payload never carries secrets, env files, symlinked code or other folders", () => {
	const whole = JSON.stringify(
		JSON.parse(cli([repo, "--dry-run", "--json"]).stdout).payload
	);
	assert.ok(whole.includes(markers.source));
	assert.ok(whole.includes(markers.sibling));
	for (const marker of [
		markers.env,
		markers.secret,
		markers.outside,
		markers.ancestor,
	]) {
		assert.ok(!whole.includes(marker), `${marker} reached the payload`);
	}
	const scoped = JSON.parse(
		cli([join(repo, "src/app"), "--dry-run", "--json"]).stdout
	) as { files: { path: string }[]; payload: { segments: unknown[] } };
	assert.ok(!JSON.stringify(scoped.payload.segments).includes(markers.sibling));
	assert.deepEqual(scoped.files.map((file) => file.path).sort(), [
		"src/app/checkout.tsx",
		"src/app/settings.tsx",
	]);
});

test("a scan classifies through the chosen destination, reuses its cache and stops cleanly", async () => {
	const hosted = JSON.parse(
		cli([repo, "--json"], { mode: "valid", key: "", cache: "hosted" }).stdout
	) as { summary: Summary };
	assert.equal(hosted.summary.classifiedFiles, 3);
	for (const request of await requests()) {
		assert.match(request.url, /\/public\/v1\/scan\/evaluate$/);
		assert.equal(request.headers.Authorization, undefined);
		assert.match(
			request.headers["x-databuddy-scan-run"] ?? "",
			/^[0-9a-f-]{36}$/
		);
		assert.ok(request.body.segments && !request.body.state);
	}

	const before = (await requests()).length;
	const direct = JSON.parse(
		cli([repo, "--json"], { mode: "retry-once", runtime: "bun" }).stdout
	) as { summary: Summary };
	assert.equal(direct.summary.classifiedFiles, 3);
	const sent = (await requests()).slice(before);
	assert.equal(direct.summary.requestAttempts, sent.length);
	for (const request of sent) {
		assert.equal(
			request.url,
			"https://ai-gateway.vercel.sh/v4/ai/evaluation-model"
		);
		assert.equal(
			request.headers.Authorization,
			"Bearer synthetic-key-no-network"
		);
		assert.equal(request.body.providerOptions?.gateway.zeroDataRetention, true);
	}
	const cacheRoot = join(temporary, "cache/databuddy/scan");
	const [runDir = ""] = await readdir(cacheRoot);
	const log = await readFile(
		join(cacheRoot, runDir, "progress.ndjson"),
		"utf8"
	);
	for (const secret of [
		markers.source,
		"synthetic-key-no-network",
		"DO_NOT_LOG_PROVIDER_BODY",
	]) {
		assert.ok(!log.includes(secret), `Progress log leaked ${secret}`);
	}

	const replay = JSON.parse(cli([repo, "--json"]).stdout) as {
		summary: Summary;
	};
	assert.equal(replay.summary.requestAttempts, 0);
	assert.ok(replay.summary.cachedBatches > 0);

	const child = spawn("node", ["--import", preload, scanner, repo, "--json"], {
		cwd: temporary,
		env: {
			PATH: process.env.PATH,
			XDG_CACHE_HOME: join(temporary, "interrupted"),
			AI_GATEWAY_API_KEY: "synthetic-key-no-network",
			SCAN_TEST_MODE: "interrupt",
			SCAN_TEST_CAPTURE: capture,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	const closed = new Promise<number | null>((resolve) =>
		child.once("close", resolve)
	);
	const deadline = Date.now() + 5000;
	while (
		!(await requests()).some(
			(request) => request.mode === "interrupt" && request.sequence > 1
		)
	) {
		assert.ok(
			Date.now() < deadline,
			"Interrupt fixture never reached a pending request"
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	child.kill("SIGINT");
	assert.equal(await closed, 130);
	assert.equal(
		(JSON.parse(stdout) as { summary: Summary }).summary.interrupted,
		true
	);
}, 60_000);

test("the published package installs as one file and runs under npm and bun", async () => {
	const pkg = JSON.parse(
		await readFile(join(packageDir, "package.json"), "utf8")
	);
	assert.equal(
		pkg.dependencies,
		undefined,
		"Runtime dependencies make npx install them"
	);
	assert.equal(cli(["--version"]).stdout.trim(), pkg.version);
	for (const args of [
		["--run"],
		["--no-actions"],
		["--output=x"],
		["--unknown"],
	]) {
		cli([repo, ...args], { status: 1 });
	}
	const npm = (args: string[], cwd = packageDir) => {
		const result = spawnSync("npm", args, {
			cwd,
			encoding: "utf8",
			timeout: 60_000,
		});
		assert.equal(result.status, 0, result.stderr);
		return result.stdout;
	};
	const [packed] = JSON.parse(
		npm([
			"pack",
			"--json",
			"--ignore-scripts",
			`--pack-destination=${temporary}`,
		])
	) as { filename: string; files: { path: string }[] }[];
	assert.ok(packed);
	assert.deepEqual(packed.files.map((file) => file.path).sort(), [
		"LICENSE",
		"README.md",
		"dist/THIRD_PARTY_LICENSES",
		"dist/cli.js",
		"package.json",
	]);
	const notices = await readFile(
		join(packageDir, "dist/THIRD_PARTY_LICENSES"),
		"utf8"
	);
	for (const bundled of ["commander", "typescript", "zod"]) {
		assert.match(notices, new RegExp(`^${bundled}@\\S+ \\(`, "m"));
	}
	const tarball = join(temporary, packed.filename);
	assert.equal(
		npm([
			"exec",
			"--yes",
			"--prefer-offline",
			`--package=${tarball}`,
			"--",
			"databuddy-scan",
			"--version",
		]).trim(),
		pkg.version
	);
	const installed = join(temporary, "installed");
	await mkdir(installed);
	npm([
		"install",
		"--prefer-offline",
		"--no-audit",
		"--no-fund",
		`--prefix=${installed}`,
		tarball,
	]);
	assert.deepEqual(
		(await readdir(join(installed, "node_modules"))).filter(
			(name) => !name.startsWith(".")
		),
		["@databuddy"]
	);
	const bun = spawnSync(
		"bun",
		["x", "--no-install", "--bun", "databuddy-scan", "--version"],
		{
			cwd: installed,
			encoding: "utf8",
		}
	);
	assert.equal(bun.stdout.trim(), pkg.version, bun.stderr);
}, 120_000);

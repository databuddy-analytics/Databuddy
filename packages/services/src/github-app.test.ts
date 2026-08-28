import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	createAppJwt,
	GitHubAppConfigError,
	getInstallationToken,
	isGitHubAppConfigured,
	requireGitHubAppConfig,
	userOwnsInstallation,
} from "./github-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { format: "pem", type: "pkcs1" },
	publicKeyEncoding: { format: "pem", type: "spki" },
});

const ENV_KEYS = [
	"GITHUB_APP_ID",
	"GITHUB_APP_SLUG",
	"GITHUB_APP_PRIVATE_KEY",
	"GITHUB_APP_CLIENT_ID",
	"GITHUB_APP_CLIENT_SECRET",
] as const;

let savedEnv: Record<string, string | undefined>;

function setAppEnv(): void {
	process.env.GITHUB_APP_ID = "12345";
	process.env.GITHUB_APP_SLUG = "databuddy";
	process.env.GITHUB_APP_PRIVATE_KEY = Buffer.from(privateKey).toString(
		"base64"
	);
	process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
	process.env.GITHUB_APP_CLIENT_SECRET = "secret";
}

beforeEach(() => {
	savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = savedEnv[key];
		}
	}
});

describe("requireGitHubAppConfig", () => {
	it("throws with every missing variable named", () => {
		for (const key of ENV_KEYS) {
			delete process.env[key];
		}
		expect(() => requireGitHubAppConfig()).toThrow(GitHubAppConfigError);
		expect(() => requireGitHubAppConfig()).toThrow(
			/GITHUB_APP_ID.*GITHUB_APP_SLUG.*GITHUB_APP_PRIVATE_KEY/
		);
		expect(isGitHubAppConfigured()).toBe(false);
	});

	it("decodes a base64 private key and accepts inline PEM", () => {
		setAppEnv();
		expect(requireGitHubAppConfig().privateKey).toContain(
			"BEGIN RSA PRIVATE KEY"
		);

		process.env.GITHUB_APP_PRIVATE_KEY = privateKey.replaceAll("\n", "\\n");
		expect(requireGitHubAppConfig().privateKey).toContain(
			"BEGIN RSA PRIVATE KEY"
		);
		expect(isGitHubAppConfigured()).toBe(true);
	});
});

describe("createAppJwt", () => {
	it("produces a verifiable RS256 token with app claims", () => {
		setAppEnv();
		const now = 1_700_000_000_000;
		const jwt = createAppJwt(requireGitHubAppConfig(), now);
		const [header, payload, signature] = jwt.split(".");

		const verifier = createVerify("RSA-SHA256");
		verifier.update(`${header}.${payload}`);
		expect(
			verifier.verify(publicKey, Buffer.from(signature, "base64url"))
		).toBe(true);

		const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
		expect(claims.iss).toBe("12345");
		expect(claims.iat).toBe(1_700_000_000 - 60);
		expect(claims.exp).toBe(1_700_000_000 + 540);
		expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
			alg: "RS256",
			typ: "JWT",
		});
	});
});

describe("getInstallationToken", () => {
	it("mints once and serves the cached token until expiry", async () => {
		setAppEnv();
		const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					token: "ghs_test",
					expires_at: new Date(Date.now() + 3_600_000).toISOString(),
				}),
				{ status: 201 }
			)
		);
		try {
			expect(await getInstallationToken("42")).toBe("ghs_test");
			expect(await getInstallationToken("42")).toBe("ghs_test");
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://api.github.com/app/installations/42/access_tokens");
			expect(init.method).toBe("POST");
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it("returns null and drops the cache entry on provider failure", async () => {
		setAppEnv();
		const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("nope", { status: 404 })
		);
		try {
			expect(await getInstallationToken("43")).toBeNull();
		} finally {
			fetchSpy.mockRestore();
		}
	});
});

describe("userOwnsInstallation", () => {
	it("matches installations by id", async () => {
		const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({ installations: [{ id: 42 }, { id: 7 }] }),
				{ status: 200 }
			)
		);
		try {
			expect(await userOwnsInstallation("user-token", "42")).toBe(true);
			expect(await userOwnsInstallation("user-token", "999")).toBe(false);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it("rejects on provider errors", async () => {
		const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("denied", { status: 401 })
		);
		try {
			expect(await userOwnsInstallation("user-token", "42")).toBe(false);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});

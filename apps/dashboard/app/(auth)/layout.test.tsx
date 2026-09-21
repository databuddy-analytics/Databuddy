import { afterEach, expect, mock, test } from "bun:test";

const waitForRequest = mock(async () => {});
mock.module("next/server", () => ({ connection: waitForRequest }));
const { default: Layout } = await import("./layout");
const originalEnv = process.env;

afterEach(() => {
	process.env = originalEnv;
	waitForRequest.mockClear();
});

test.each([
	{ name: "hosted defaults", env: {}, expected: undefined },
	{
		name: "hosted explicit false",
		env: { SELFHOST: "false" },
		expected: undefined,
	},
	{
		name: "self-hosted without optional services",
		env: { SELFHOST: "true" },
		expected: {
			email: false,
			github: false,
			google: false,
			verifyEmail: false,
		},
	},
	{
		name: "self-hosted partial OAuth credentials",
		env: {
			SELFHOST: "true",
			GITHUB_CLIENT_ID: "example-id",
			GOOGLE_CLIENT_SECRET: "example-secret",
		},
		expected: {
			email: false,
			github: false,
			google: false,
			verifyEmail: false,
		},
	},
	{
		name: "self-hosted configured services",
		env: {
			SELFHOST: "true",
			RESEND_API_KEY: "example-resend-key",
			GITHUB_CLIENT_ID: "example-id",
			GITHUB_CLIENT_SECRET: "example-secret",
			GOOGLE_CLIENT_ID: "example-id",
			GOOGLE_CLIENT_SECRET: "example-secret",
			REQUIRE_EMAIL_VERIFICATION: " TRUE ",
		},
		expected: { email: true, github: true, google: true, verifyEmail: true },
	},
])("$name", async ({ env, expected }) => {
	process.env = { NODE_ENV: "production", ...env };
	const layout = await Layout({ children: null });
	expect(layout.props.capabilities).toEqual(expected);
	expect(waitForRequest).toHaveBeenCalledTimes(expected ? 1 : 0);
	expect(JSON.stringify(layout.props)).not.toContain("example-secret");
});

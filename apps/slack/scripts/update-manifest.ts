import {
	WebClient,
	type AppsManifestUpdateArguments,
	type AppsManifestUpdateResponse,
	type AppsManifestValidateResponse,
} from "@slack/web-api";
import { readFile } from "node:fs/promises";

const MANIFEST_PATH = new URL("../slack-app-manifest.json", import.meta.url);
const CONFIG_TOKEN_ENV = "SLACK_APP_CONFIG_TOKEN";
const APP_ID_ENV = "SLACK_APP_ID";

type ManifestMode = "update" | "validate";
type Manifest = AppsManifestUpdateArguments["manifest"];
type ManifestResponse =
	| AppsManifestUpdateResponse
	| AppsManifestValidateResponse;

const mode = parseMode(process.argv.slice(2));

try {
	const token = getConfigToken();
	const manifest = await readManifest();
	const client = new WebClient(token);

	const response =
		mode === "validate"
			? await client.apps.manifest.validate({
					app_id: getOptionalEnv(APP_ID_ENV),
					manifest,
				})
			: await client.apps.manifest.update({
					app_id: getRequiredEnv(APP_ID_ENV),
					manifest,
				});

	reportSuccess(mode, response);
} catch (error) {
	reportFailure(error);
}

function parseMode(args: string[]): ManifestMode {
	const flags = new Set(args);

	if (flags.has("--help") || flags.has("-h")) {
		console.log(`Usage:
  bun run manifest:validate
  bun run manifest:update

Environment:
  ${CONFIG_TOKEN_ENV}  Slack app configuration token with app_configurations:write
  ${APP_ID_ENV}            Slack app id, for example A0123456789
`);
		process.exit(0);
	}

	for (const flag of flags) {
		if (flag !== "--validate") {
			fail(`Unknown option "${flag}". Run with --help for usage.`);
		}
	}

	return flags.has("--validate") ? "validate" : "update";
}

async function readManifest(): Promise<Manifest> {
	const content = await readFile(MANIFEST_PATH, "utf8");
	const parsed = JSON.parse(content) as unknown;

	if (!(isRecord(parsed) && isRecord(parsed.display_information))) {
		fail(
			`Slack manifest at ${MANIFEST_PATH.pathname} must be a JSON object with display_information.`
		);
	}

	return parsed as Manifest;
}

function getConfigToken(): string {
	const token = getRequiredEnv(CONFIG_TOKEN_ENV);

	if (token.startsWith("xoxb-")) {
		fail(
			`${CONFIG_TOKEN_ENV} is a bot token. Create a Slack app configuration token with app_configurations:write instead.`
		);
	}

	return token;
}

function getRequiredEnv(name: string): string {
	const value = getOptionalEnv(name);

	if (!value) {
		fail(`Missing ${name}.`);
	}

	return value;
}

function getOptionalEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value || undefined;
}

function reportSuccess(mode: ManifestMode, response: ManifestResponse) {
	if (!response.ok) {
		fail(formatSlackResponseError(response));
	}

	if (mode === "validate") {
		console.log("Slack manifest is valid.");
	} else {
		const appId =
			"app_id" in response && typeof response.app_id === "string"
				? response.app_id
				: getOptionalEnv(APP_ID_ENV);
		console.log(`Updated Slack app manifest${appId ? ` for ${appId}` : ""}.`);
	}

	const metadata = response.response_metadata as
		| { messages?: string[]; warnings?: string[] }
		| undefined;
	const messages = metadata?.messages ?? metadata?.warnings ?? [];

	for (const message of messages) {
		console.log(`- ${message}`);
	}
}

function formatSlackResponseError(response: ManifestResponse) {
	if (response.error === "not_allowed_token_type") {
		return formatWrongTokenTypeError();
	}

	const details = [
		response.error && `error: ${response.error}`,
		"needed" in response && response.needed && `needed: ${response.needed}`,
		"provided" in response &&
			response.provided &&
			`provided: ${response.provided}`,
		"errors" in response &&
			response.errors &&
			`errors: ${JSON.stringify(response.errors, null, 2)}`,
	].filter(Boolean);

	return details.length > 0
		? `Slack manifest request failed:\n${details.join("\n")}`
		: "Slack manifest request failed.";
}

function reportFailure(error: unknown): never {
	const slackData = getSlackErrorData(error);

	if (slackData) {
		fail(formatSlackPlatformError(slackData));
	}

	if (error instanceof SyntaxError) {
		fail(`Slack manifest is not valid JSON: ${error.message}`);
	}

	if (error instanceof Error) {
		fail(error.message);
	}

	fail("Slack manifest request failed.");
}

function getSlackErrorData(
	error: unknown
): Record<string, unknown> | undefined {
	if (!isRecord(error)) {
		return;
	}

	return isRecord(error.data) ? error.data : undefined;
}

function formatSlackPlatformError(data: Record<string, unknown>) {
	if (data.error === "not_allowed_token_type") {
		return formatWrongTokenTypeError();
	}

	const details = [
		typeof data.error === "string" && `error: ${data.error}`,
		typeof data.needed === "string" && `needed: ${data.needed}`,
		typeof data.provided === "string" && `provided: ${data.provided}`,
		"response_metadata" in data &&
			`response_metadata: ${JSON.stringify(data.response_metadata, null, 2)}`,
		"errors" in data && `errors: ${JSON.stringify(data.errors, null, 2)}`,
	].filter(Boolean);

	return details.length > 0
		? `Slack manifest request failed:\n${details.join("\n")}`
		: "Slack manifest request failed.";
}

function formatWrongTokenTypeError() {
	return [
		"Slack rejected the token type.",
		`${CONFIG_TOKEN_ENV} must be a Slack app configuration access token for the Manifest APIs, not the Socket Mode app token or bot token.`,
		"Generate one from the Slack app dashboard under Your App Configuration Tokens.",
	].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

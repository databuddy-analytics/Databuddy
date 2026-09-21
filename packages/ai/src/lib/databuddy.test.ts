import { afterEach, expect, mock, test } from "bun:test";
import type { CustomEventInput, DatabuddyConfig } from "@databuddy/sdk/node";

const originalEnv = process.env;
const create = mock((_options: DatabuddyConfig) => {});
const track = mock(async (_event: CustomEventInput) => {});

mock.module("@databuddy/sdk/node", () => ({
	Databuddy: class {
		track = track;
		constructor(options: DatabuddyConfig) {
			create(options);
		}
	},
}));

afterEach(() => {
	process.env = originalEnv;
	create.mockClear();
	track.mockClear();
});

test.each([
	{ selfHost: "true", clients: 0 },
	{ selfHost: " TRUE ", clients: 0 },
	{ selfHost: "false", clients: 2 },
])("product telemetry with SELFHOST=$selfHost", async ({
	selfHost,
	clients,
}) => {
	process.env = {
		...originalEnv,
		SELFHOST: selfHost,
		DATABUDDY_API_KEY: "synthetic-api-key",
		DATABUDDY_WEBSITE_ID: "synthetic-website",
	};
	const telemetry = await import(`./databuddy.ts?selfhost=${selfHost}`);
	telemetry.trackAgentEvent("agent_activity");
	telemetry.trackMutationEvent("website_created", { namespace: "websites" });

	expect(create).toHaveBeenCalledTimes(clients);
	expect(track).toHaveBeenCalledTimes(clients);
});

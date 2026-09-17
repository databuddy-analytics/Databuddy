import { describe, expect, spyOn, test } from "bun:test";
import { config, createConfig } from "@databuddy/env/app";
import {
	buildAlarmNotificationConfig,
	buildAlarmNotificationTargets,
} from "../alarm-config";
import { NotificationClient } from "../client";

describe("buildAlarmNotificationTargets", () => {
	test.each([
		["", undefined, "App <app@example.com>"],
		[
			"Alerts <alerts@example.com>",
			undefined,
			"Alerts <alerts@example.com>",
		],
		["Alerts <alerts@example.com>", "alarm@example.com", "alarm@example.com"],
		["Alerts <alerts@example.com>", "", "Alerts <alerts@example.com>"],
	] as const)(
		"delivers alarms with sender %s and destination override %s",
		async (alertsFrom, destinationFrom, expectedFrom) => {
			const previousEmail = config.email;
			const previousApiKey = process.env.RESEND_API_KEY;
			const fetchMock = spyOn(globalThis, "fetch").mockImplementation(() =>
				Promise.resolve(Response.json({ id: "email-example" }))
			);
			process.env.RESEND_API_KEY = "re_test_key";
			try {
				config.email = createConfig({
					ALERTS_EMAIL_FROM: alertsFrom,
					EMAIL_FROM: "App <app@example.com>",
				}).email;
				const [target] = buildAlarmNotificationTargets([
					{
						type: "email",
						identifier: "recipient@example.com",
						config: { from: destinationFrom },
					},
				]);
				expect(target?.channel).toBe("email");
				const result = await new NotificationClient(target?.clientConfig).send(
					{ title: "Site alert", message: "The site is unavailable." },
					{ channels: ["email"] }
				);
				expect(result).toEqual([{ channel: "email", success: true }]);
				const request = fetchMock.mock.calls.at(-1)?.[1];
				expect(JSON.parse(String(request?.body))).toMatchObject({
					from: expectedFrom,
					to: ["recipient@example.com"],
				});
			} finally {
				config.email = previousEmail;
				fetchMock.mockRestore();
				if (previousApiKey === undefined) {
					Reflect.deleteProperty(process.env, "RESEND_API_KEY");
				} else {
					process.env.RESEND_API_KEY = previousApiKey;
				}
			}
		}
	);

	test("keeps same-channel destinations as separate delivery targets", () => {
		const firstSlack = "https://hooks.slack.com/services/T000/B000/first";
		const secondSlack = "https://hooks.slack.com/services/T000/B000/second";

		const targets = buildAlarmNotificationTargets([
			{ type: "slack", identifier: firstSlack, config: {} },
			{ type: "slack", identifier: secondSlack, config: {} },
			{
				type: "webhook",
				identifier: "https://example.com/alarm",
				config: {
					headers: {
						authorization: "drop-me",
						"X-Array": ["drop-me"],
						"X-Alarm": "keep-me",
						"X-Bad\r\nName": "drop-me",
						"X-Bad-Value": "drop\r\nme",
					},
				},
			},
		]);

		expect(targets.map((target) => target.channel)).toEqual([
			"slack",
			"slack",
			"webhook",
		]);
		expect(targets[0]?.clientConfig.slack?.webhookUrl).toBe(firstSlack);
		expect(targets[1]?.clientConfig.slack?.webhookUrl).toBe(secondSlack);
		expect(targets[2]?.clientConfig.webhook).toEqual({
			url: "https://example.com/alarm",
			headers: { "X-Alarm": "keep-me" },
		});
	});

	test("skips the email delivery target when Resend is not configured", () => {
		const previousApiKey = process.env.RESEND_API_KEY;
		delete process.env.RESEND_API_KEY;
		try {
			const targets = buildAlarmNotificationTargets([
				{
					type: "email",
					identifier: "recipient@example.com",
					config: {},
				},
			]);
			expect(targets).toEqual([]);
		} finally {
			if (previousApiKey === undefined) {
				delete process.env.RESEND_API_KEY;
			} else {
				process.env.RESEND_API_KEY = previousApiKey;
			}
		}
	});
});

describe("buildAlarmNotificationConfig", () => {
	test("keeps legacy channels unique when duplicate destination types are provided", () => {
		const firstSlack = "https://hooks.slack.com/services/T000/B000/first";
		const secondSlack = "https://hooks.slack.com/services/T000/B000/second";

		const config = buildAlarmNotificationConfig([
			{ type: "slack", identifier: firstSlack, config: {} },
			{ type: "slack", identifier: secondSlack, config: {} },
			{
				type: "webhook",
				identifier: "https://example.com/alarm",
				config: {},
			},
		]);

		expect(config.channels).toEqual(["slack", "webhook"]);
		expect(config.clientConfig.slack?.webhookUrl).toBe(firstSlack);
		expect(config.clientConfig.webhook?.url).toBe("https://example.com/alarm");
	});
});

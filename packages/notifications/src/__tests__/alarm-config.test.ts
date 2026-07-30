import { describe, expect, test } from "bun:test";
import {
	buildAlarmNotificationConfig,
	buildAlarmNotificationTargets,
} from "../alarm-config";

describe("buildAlarmNotificationTargets", () => {
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

	test("builds an email delivery target when Resend is configured", () => {
		const previousApiKey = process.env.RESEND_API_KEY;
		process.env.RESEND_API_KEY = "re_test_key";
		try {
			const [target] = buildAlarmNotificationTargets([
				{
					type: "email",
					identifier: "recipient@example.com",
					config: {},
				},
			]);
			expect(target?.channel).toBe("email");
			expect(target?.clientConfig.email?.defaultTo).toBe(
				"recipient@example.com"
			);
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

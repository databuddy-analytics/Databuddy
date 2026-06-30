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

import { describe, expect, test } from "bun:test";
import { NotificationClient } from "../client";
import type { NotificationChannel } from "../types";

describe("NotificationClient", () => {
	test("snapshots caller-owned channels before awaiting providers", async () => {
		const channels: NotificationChannel[] = ["slack", "email"];
		const client = new NotificationClient();
		const pending = client.send(
			{ title: "Status changed", message: "A monitor is down." },
			{ channels }
		);

		channels.length = 0;

		const results = await pending;
		expect(results.map((result) => result.channel)).toEqual([
			"slack",
			"email",
		]);
		expect(results.every((result) => !result.success)).toBe(true);
	});
});

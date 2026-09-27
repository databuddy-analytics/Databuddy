import { describe, expect, it } from "bun:test";
import { ErrorCode, LogLevel, WebClient } from "@slack/web-api";
import { SLACK_WEB_CLIENT_OPTIONS } from "@/config";

describe("interactive Slack API requests", () => {
	it("times out a stalled HTTP request without replaying the write", async () => {
		let requests = 0;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				requests++;
				return new Promise<Response>(() => {
					// Hold the connection open until the client's timeout closes it.
				});
			},
		});
		const client = new WebClient("test-token", {
			...SLACK_WEB_CLIENT_OPTIONS,
			logLevel: LogLevel.ERROR,
			slackApiUrl: server.url.toString(),
		});

		try {
			await expect(
				client.chat.postMessage({ channel: "C_TEST", text: "Test answer" })
			).rejects.toMatchObject({
				code: ErrorCode.RequestError,
				original: { code: "ECONNABORTED" },
			});
			expect(requests).toBe(1);
		} finally {
			await server.stop(true);
		}
	}, 8000);

	it("does not replay a failed Slack write", async () => {
		let requests = 0;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				requests++;
				return new Response("Unavailable", { status: 503 });
			},
		});
		const client = new WebClient("test-token", {
			...SLACK_WEB_CLIENT_OPTIONS,
			logLevel: LogLevel.ERROR,
			slackApiUrl: server.url.toString(),
		});

		try {
			await expect(
				client.chat.appendStream({
					channel: "C_TEST",
					ts: "123.456",
					markdown_text: "Test answer",
				})
			).rejects.toMatchObject({ code: ErrorCode.HTTPError, statusCode: 503 });
			expect(requests).toBe(1);
		} finally {
			await server.stop(true);
		}
	});

	it("rejects rate limits without sleeping or blocking other calls", async () => {
		const requests: string[] = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const method = new URL(request.url).pathname;
				requests.push(method);
				if (method === "/chat.appendStream") {
					return new Response("Rate limited", {
						status: 429,
						headers: { "Retry-After": "3600" },
					});
				}
				return Response.json({ ok: true });
			},
		});
		const client = new WebClient("test-token", {
			...SLACK_WEB_CLIENT_OPTIONS,
			logLevel: LogLevel.ERROR,
			slackApiUrl: server.url.toString(),
		});

		try {
			await expect(
				client.chat.appendStream({
					channel: "C_TEST",
					ts: "123.456",
					markdown_text: "Test answer",
				})
			).rejects.toMatchObject({
				code: ErrorCode.RateLimitedError,
				retryAfter: 3600,
			});
			await expect(
				client.chat.stopStream({ channel: "C_TEST", ts: "123.456" })
			).resolves.toMatchObject({ ok: true });
			expect(requests).toEqual(["/chat.appendStream", "/chat.stopStream"]);
		} finally {
			await server.stop(true);
		}
	});
});

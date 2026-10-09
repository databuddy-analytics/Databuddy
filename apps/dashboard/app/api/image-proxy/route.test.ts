import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as ssrf from "@databuddy/shared/ssrf-guard";
import { NextRequest } from "next/server";

mock.module("@databuddy/redis/rate-limit", () => ({
	ratelimit: async () => ({ success: true }),
	getRateLimitHeaders: () => ({}),
}));

const { GET } = await import("./route");
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;
const OVERSIZED_HEADERS: Record<string, string>[] = [
	{},
	{ "content-length": "1" },
];

function streamedImage(
	totalBytes: number,
	headers: Record<string, string> = {},
	status = 200,
	chunkSize = CHUNK_SIZE
) {
	const state = { bytesProduced: 0, cancelled: false };
	const body = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				if (state.bytesProduced === totalBytes) {
					controller.close();
					return;
				}
				const size = Math.min(chunkSize, totalBytes - state.bytesProduced);
				state.bytesProduced += size;
				controller.enqueue(new Uint8Array(size).fill(37));
			},
			cancel() {
				state.cancelled = true;
			},
		},
		{ highWaterMark: 0 }
	);
	const response = new Response(body, {
		status,
		headers: { "content-type": "image/png", ...headers },
	});
	spyOn(ssrf, "safeFetch").mockResolvedValue(response);
	return state;
}

function request() {
	return GET(
		new NextRequest(
			"http://localhost/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png"
		)
	);
}

afterEach(() => mock.restore());

describe("image proxy response bounds", () => {
	it.each(
		OVERSIZED_HEADERS
	)("cancels an oversized stream early with headers %j", async (headers) => {
		const state = streamedImage(8 * 1024 * 1024, headers);
		const response = await request();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Image too large" });
		expect(state.bytesProduced).toBe(MAX_IMAGE_SIZE + CHUNK_SIZE);
		expect(state.cancelled).toBe(true);
	});

	it("rejects and cancels a single chunk exceeding the limit", async () => {
		const state = streamedImage(8 * 1024 * 1024, {}, 200, 4 * 1024 * 1024);
		expect((await request()).status).toBe(400);
		expect(state.bytesProduced).toBe(4 * 1024 * 1024);
		expect(state.cancelled).toBe(true);
	});

	it("returns an image exactly at the limit with its existing headers", async () => {
		streamedImage(MAX_IMAGE_SIZE, {
			"content-type": "image/png; charset=binary",
		});
		const response = await request();
		expect(response.status).toBe(200);
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect(bytes.byteLength).toBe(MAX_IMAGE_SIZE);
		expect(bytes.every((byte) => byte === 37)).toBe(true);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=86400, s-maxage=86400"
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; img-src 'self'"
		);
	});

	it("preserves many small chunks without including unused buffer bytes", async () => {
		streamedImage(1000, {}, 200, 1);
		const response = await request();
		expect(response.status).toBe(200);
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect(bytes.byteLength).toBe(1000);
		expect(bytes.every((byte) => byte === 37)).toBe(true);
	});

	it.each([
		[{ "content-length": String(MAX_IMAGE_SIZE + 1) }, 200, 400],
		[{ "content-type": "text/html" }, 200, 400],
		[{}, 503, 502],
	] as const)("cancels rejected responses without reading them: %j, %s", async (headers, status, expectedStatus) => {
		const state = streamedImage(8 * 1024 * 1024, headers, status);
		expect((await request()).status).toBe(expectedStatus);
		expect(state.bytesProduced).toBe(0);
		expect(state.cancelled).toBe(true);
	});

	it("returns a fetch error when the upstream stream fails", async () => {
		spyOn(ssrf, "safeFetch").mockResolvedValue(
			new Response(
				new ReadableStream({
					pull(controller) {
						controller.error(new Error("Upstream disconnected"));
					},
				}),
				{ headers: { "content-type": "image/png" } }
			)
		);
		const response = await request();
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Failed to fetch image" });
	});

	it("keeps the deadline active while reading the upstream body", async () => {
		const controller = new AbortController();
		spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
		const safeFetch = spyOn(ssrf, "safeFetch").mockImplementation(
			(_url, options) => {
				expect(options?.timeoutMs).toBe(10_000);
				expect(options?.maxRedirects).toBe(0);
				expect(options?.signal).toBe(controller.signal);
				return Promise.resolve(
					new Response(
						new ReadableStream({
							pull(streamController) {
								controller.abort(
									new DOMException("Body deadline", "TimeoutError")
								);
								streamController.error(controller.signal.reason);
							},
						}),
						{ headers: { "content-type": "image/png" } }
					)
				);
			}
		);
		const response = await request();
		expect(safeFetch).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({ error: "Request timeout" });
	});

	it("preserves SSRF rejection", async () => {
		spyOn(ssrf, "safeFetch").mockRejectedValue(
			new ssrf.SsrfError("Private IP")
		);
		const response = await request();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "URL not allowed" });
	});
});

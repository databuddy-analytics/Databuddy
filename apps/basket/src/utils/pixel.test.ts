import { describe, expect, test } from "vitest";
import { createPixelResponse, parsePixelQuery } from "./pixel";

// ── createPixelResponse ──

describe("createPixelResponse", () => {
	test("returns 200 image/gif with no-cache headers", async () => {
		const r = createPixelResponse();
		expect(r.status).toBe(200);
		expect(r.headers.get("Content-Type")).toBe("image/gif");
		expect(r.headers.get("Cache-Control")).toContain("no-cache");
		expect(r.headers.get("Pragma")).toBe("no-cache");
		expect(r.headers.get("Expires")).toBe("0");

		const buf = await r.arrayBuffer();
		expect(buf.byteLength).toBeGreaterThan(0);
		// GIF89a magic bytes
		expect(new Uint8Array(buf).slice(0, 3)).toEqual(
			new Uint8Array([0x47, 0x49, 0x46])
		);
	});
});

// ── parsePixelQuery ──

describe("parsePixelQuery", () => {
	test("empty query → empty eventData, type=track", () => {
		const { eventData, eventType } = parsePixelQuery({});
		expect(eventData).toEqual({});
		expect(eventType).toBe("track");
	});

	test("flat keys → typed values", () => {
		const { eventData } = parsePixelQuery({
			name: "pageview",
			timestamp: "1700000000",
			scroll_depth: "75.5",
			is_bounce: "true",
			title: "Hello",
		});
		expect(eventData.name).toBe("pageview");
		expect(eventData.timestamp).toBe(1_700_000_000);
		expect(eventData.scroll_depth).toBe(75.5);
		expect(eventData.is_bounce).toBe(true);
		expect(eventData.title).toBe("Hello");
	});

	test("false string → boolean false", () => {
		const { eventData } = parsePixelQuery({ flag: "false" });
		expect(eventData.flag).toBe(false);
	});

	test("type field → eventType", () => {
		const { eventType } = parsePixelQuery({ type: "outgoing_link" });
		expect(eventType).toBe("outgoing_link");
	});

	test("nested keys: payload[path]", () => {
		const { eventData } = parsePixelQuery({
			"payload[path]": "/home",
			"payload[title]": "Home",
		});
		expect(eventData.payload).toEqual({ path: "/home", title: "Home" });
	});

	test("deeply nested: a[b][c]", () => {
		const { eventData } = parsePixelQuery({ "a[b][c]": "deep" });
		expect(eventData.a).toEqual({ b: { c: "deep" } });
	});

	test("skips SDK metadata keys", () => {
		const { eventData } = parsePixelQuery({
			sdk_name: "js",
			sdk_version: "1.0",
			client_id: "abc",
			name: "pageview",
		});
		expect(eventData).not.toHaveProperty("sdk_name");
		expect(eventData).not.toHaveProperty("sdk_version");
		expect(eventData).not.toHaveProperty("client_id");
		expect(eventData.name).toBe("pageview");
	});

	test("properties key → parsed JSON", () => {
		const { eventData } = parsePixelQuery({
			properties: '{"color":"red","count":3}',
		});
		expect(eventData.properties).toEqual({ color: "red", count: 3 });
	});

	test("invalid properties JSON → empty object", () => {
		const { eventData } = parsePixelQuery({ properties: "not-json{" });
		expect(eventData.properties).toEqual({});
	});

	test("negative numbers parsed correctly", () => {
		const { eventData } = parsePixelQuery({
			offset: "-5",
			rate: "-0.5",
		});
		expect(eventData.offset).toBe(-5);
		expect(eventData.rate).toBe(-0.5);
	});

	test("large batch of flat params", () => {
		const query: Record<string, string> = {};
		for (let i = 0; i < 50; i++) {
			query[`field_${i}`] = String(i);
		}
		const { eventData } = parsePixelQuery(query);
		for (let i = 0; i < 50; i++) {
			expect(eventData[`field_${i}`]).toBe(i);
		}
	});
});

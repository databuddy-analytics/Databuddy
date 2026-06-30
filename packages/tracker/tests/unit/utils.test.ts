import { afterEach, describe, expect, test } from "bun:test";
import { getTrackerConfig } from "../../src/core/utils";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: originalDocument,
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: originalWindow,
	});
});

function setTrackerScript({
	attributes,
	src,
}: {
	attributes: Array<{ name: string; value: string }>;
	src: string;
}) {
	const script = { attributes, src };

	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			currentScript: script,
			getElementsByTagName: () => [script],
		},
	});
}

describe("getTrackerConfig", () => {
	test("preserves empty strings in URL query params while data attributes treat them as true", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				databuddyConfig: {
					apiUrl: "https://global.example",
					clientId: "global-client",
				},
			},
		});
		setTrackerScript({
			attributes: [
				{ name: "data-client-id", value: "data-client" },
				{ name: "data-track-attributes", value: "" },
			],
			src: "https://cdn.example.com/databuddy-debug.js?clientId=&apiUrl=&ignoreBotDetection=&batchSize=10&disabled=false",
		});

		const config = getTrackerConfig();

		expect(config.clientId).toBe("");
		expect(config.apiUrl).toBe("");
		expect(config.trackAttributes).toBe(true);
		expect(config.ignoreBotDetection).toBe("");
		expect(config.batchSize).toBe(10);
		expect(config.disabled).toBe(false);
	});
});

import { afterEach, expect, test } from "bun:test";
import { createScript } from "../src/core/script";
import type { DatabuddyConfig } from "../src/core/types";

const originalDocument = globalThis.document;

afterEach(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: originalDocument,
	});
});

test("browser script injection drops legacy client secrets at runtime", () => {
	const attributes = new Map<string, string>();
	const script = {
		async: false,
		crossOrigin: "",
		src: "",
		setAttribute: (key: string, value: string) => attributes.set(key, value),
	};
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: { createElement: () => script },
	});

	createScript({
		clientId: "site_example",
		clientSecret: "must-not-reach-the-dom",
	} as unknown as DatabuddyConfig);

	expect(attributes.get("data-client-id")).toBe("site_example");
	expect(attributes.has("data-client-secret")).toBe(false);
});

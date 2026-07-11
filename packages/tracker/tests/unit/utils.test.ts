import { afterEach, describe, expect, test } from "bun:test";
import { Databuddy } from "../../src/index";
import {
	buildPagePath,
	getTrackerConfig,
	isOptedOut,
	sanitizePageUrl,
} from "../../src/core/utils";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

afterEach(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: originalDocument,
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: originalWindow,
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: originalNavigator,
	});
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: originalLocalStorage,
	});
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: originalSessionStorage,
	});
});

function createStorage(initial: Record<string, string> = {}): Storage {
	const values = new Map(Object.entries(initial));
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
}

const STORED_IDENTITY = {
	did: "anon_previous",
	did_params: JSON.stringify({ gclid: "private-click-id" }),
	did_profile: "profile_previous",
};

const STORED_SESSION = {
	did_profile_sent: "profile_previous",
	did_session: "sess_previous",
	did_session_start: "1",
	did_session_timestamp: "1",
};

function constructOptedOutTracker({
	doNotTrack = "0",
	globalPrivacyControl = false,
	explicit = false,
}: {
	doNotTrack?: string;
	explicit?: boolean;
	globalPrivacyControl?: boolean;
}) {
	const local = createStorage({
		...STORED_IDENTITY,
		...(explicit ? { databuddy_opt_out: "true" } : {}),
	});
	const session = createStorage(STORED_SESSION);
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {},
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { databuddyOptedOut: explicit },
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { doNotTrack, globalPrivacyControl },
	});
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: local,
	});
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: session,
	});

	const tracker = new Databuddy({ clientId: "site_example" });
	return { local, session, tracker };
}

function expectNoStoredIdentity(local: Storage, session: Storage): void {
	for (const key of Object.keys(STORED_IDENTITY)) {
		expect(local.getItem(key)).toBeNull();
	}
	for (const key of Object.keys(STORED_SESSION)) {
		expect(session.getItem(key)).toBeNull();
	}
}

describe("privacy-safe page context", () => {
	test("omits query parameters and hashes from page and referrer URLs", () => {
		expect(
			buildPagePath("https://example.com", "/account/123", ["/account/*"])
		).toBe("https://example.com/account/*");
		expect(
			sanitizePageUrl(
				"https://referrer.example/path?token=secret#private-section"
			)
		).toBe("https://referrer.example/path");
	});

	test("honors Global Privacy Control", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {},
		});
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: { globalPrivacyControl: true, doNotTrack: "0" },
		});

		expect(isOptedOut()).toBe(true);
	});

	test("honors Do Not Track", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {},
		});
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: { globalPrivacyControl: false, doNotTrack: "1" },
		});

		expect(isOptedOut()).toBe(true);
	});

	test.each([
		["Global Privacy Control", { globalPrivacyControl: true }],
		["Do Not Track", { doNotTrack: "1" }],
		["explicit opt-out", { explicit: true }],
	] as const)("direct construction stores no identity for %s", (_name, privacy) => {
		const { local, session } = constructOptedOutTracker(privacy);

		expectNoStoredIdentity(local, session);
	});

	test("refreshUrlParams clears attribution while opted out", () => {
		const { local, session, tracker } = constructOptedOutTracker({
			globalPrivacyControl: true,
		});
		local.setItem("did_params", JSON.stringify({ gclid: "new-private-id" }));

		(
			tracker as unknown as { refreshUrlParams: () => void }
		).refreshUrlParams();

		expectNoStoredIdentity(local, session);
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

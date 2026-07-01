import { describe, expect, it } from "vitest";
import {
	AVAILABLE_API_SCOPES,
	HIDDEN_OPENAPI_ROUTERS,
	OPENAPI_TAGS,
} from "./openapi-config";

describe("OpenAPI reference config", () => {
	it("keeps status page and uptime routes discoverable together", () => {
		const tagNames = OPENAPI_TAGS.map((tag) => tag.name);

		expect(HIDDEN_OPENAPI_ROUTERS).not.toContain("uptime");
		expect(tagNames).toContain("StatusPage");
		expect(tagNames).toContain("Uptime");
		expect(AVAILABLE_API_SCOPES).toContain("read:monitors");
		expect(AVAILABLE_API_SCOPES).toContain("write:monitors");
		expect(AVAILABLE_API_SCOPES).toContain("read:status_pages");
		expect(AVAILABLE_API_SCOPES).toContain("write:status_pages");
	});
});

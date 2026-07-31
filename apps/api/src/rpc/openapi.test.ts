import { describe, expect, it } from "vitest";
import {
	AVAILABLE_API_SCOPES,
	OPENAPI_TAGS,
	PUBLIC_OPENAPI_ROUTERS,
} from "./openapi-config";

describe("OpenAPI reference config", () => {
	it("publishes only approved REST routers", () => {
		const tagNames = OPENAPI_TAGS.map((tag) => tag.name);

		expect(PUBLIC_OPENAPI_ROUTERS).toEqual([
			"alarms",
			"annotations",
			"apikeys",
			"autocomplete",
			"feedback",
			"flags",
			"funnels",
			"goals",
			"linkFolders",
			"links",
			"organizations",
			"statusPage",
			"targetGroups",
			"tracker",
			"uptime",
			"websites",
		]);
		expect(PUBLIC_OPENAPI_ROUTERS).not.toContain("agentChats");
		expect(PUBLIC_OPENAPI_ROUTERS).not.toContain("anomalies");
		expect(PUBLIC_OPENAPI_ROUTERS).not.toContain("insights");
		expect(PUBLIC_OPENAPI_ROUTERS).not.toContain("integrations");
		expect(PUBLIC_OPENAPI_ROUTERS).not.toContain("profiles");
		expect(tagNames).toContain("StatusPage");
		expect(tagNames).toContain("Tracker");
		expect(tagNames).toContain("Uptime");
		expect(tagNames).not.toContain("Preferences");
		expect(AVAILABLE_API_SCOPES).toContain("read:monitors");
		expect(AVAILABLE_API_SCOPES).toContain("write:monitors");
		expect(AVAILABLE_API_SCOPES).toContain("read:status_pages");
		expect(AVAILABLE_API_SCOPES).toContain("write:status_pages");
	});
});

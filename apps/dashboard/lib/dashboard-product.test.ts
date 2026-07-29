import { afterEach, describe, expect, test } from "bun:test";
import { isIntelligenceDashboard } from "./dashboard-product";

const originalProduct = process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
	process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT = originalProduct;
	process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("isIntelligenceDashboard", () => {
	test("returns true when product flag is intelligence", () => {
		process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT = "intelligence";
		process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
		expect(isIntelligenceDashboard()).toBe(true);
	});

	test("returns true for intelligence production host", () => {
		process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT = "";
		process.env.NEXT_PUBLIC_APP_URL = "https://intelligence.databuddy.cc";
		expect(isIntelligenceDashboard()).toBe(true);
	});

	test("returns true for local intelligence port", () => {
		process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT = "";
		process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3003";
		expect(isIntelligenceDashboard()).toBe(true);
	});

	test("returns false for main dashboard", () => {
		process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT = "";
		process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
		expect(isIntelligenceDashboard()).toBe(false);
	});
});

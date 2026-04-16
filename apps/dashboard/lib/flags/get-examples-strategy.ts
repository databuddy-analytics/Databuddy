"use server";

import { createServerFlagsManager } from "@databuddy/sdk/node";

export interface ExamplesDisplayStrategy {
	dependencies?: {
		prerequisiteFlag: string;
		prerequisiteEnabled: boolean;
	};
	environment?: string;
	exampleCount: number; // 0, 3, or 6
	schedule?: {
		hasSchedule: boolean;
		nextChange?: string;
	};
	testCondition?: string; // Optional human-readable test condition
	variant: string; // Variant key (for debugging)
	variantValue: any; // The actual variant value
}

export async function getExamplesDisplayStrategy(
	websiteId: string,
	userId?: string,
	environment: string = process.env.NODE_ENV || "development"
): Promise<ExamplesDisplayStrategy> {
	const flagsManager = createServerFlagsManager({
		clientId: websiteId,
		apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
		user: { userId },
		debug: process.env.NODE_ENV === "development",
		environment,
	});

	// Wait for initialization (important in serverless)
	await flagsManager.waitForInit();

	try {
		const result = await flagsManager.getFlag("flag-examples-display-strategy");

		console.log("🚀 Flag result:", result);

		const variantKey = (result.payload?.variantKey as string) || "unknown";
		const variantValue = result.value;
		const exampleCount = typeof variantValue === "number" ? variantValue : 0;

		return {
			exampleCount,
			variant: variantKey,
			variantValue,
			testCondition: "multi-variant-sticky-assignment",
			environment,
		};
	} catch (error) {
		console.error("❌ Error fetching examples display flag:", error);

		// Graceful fallback
		return {
			exampleCount: 6,
			variant: "error-fallback",
			variantValue: 6,
			testCondition: "error",
			environment,
		};
	}
}

export const getShouldShowExamples = async (
	websiteId: string,
	userId: string,
	environment: string
) => {
	const flagsManager = createServerFlagsManager({
		clientId: websiteId,
		apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
		user: { userId },
		debug: process.env.NODE_ENV === "development",
		environment,
	});
	await flagsManager.waitForInit();
	const flag = await flagsManager.getFlag("enable-flag-examples");
	return flag.value;
};

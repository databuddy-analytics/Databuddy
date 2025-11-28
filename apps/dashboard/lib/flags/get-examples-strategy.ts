import { createFlagsManager } from "@databuddy/sdk/node";
import { useFlags } from "@databuddy/sdk/react";

export interface ExamplesDisplayStrategy {
    exampleCount: number; // 0, 3, or 6
    variant: string; // Variant key (for debugging)
    testCondition?: string; // Optional human‑readable test condition
}

// In-memory store for forced variant assignments
// In production, replace this with a DB table (user_id, flag_key, variant_key, value)
const forcedAssignments = new Map<string, { variantKey: string; value: number }>();

/**
 * Get the examples display strategy for a user.
 * Checks forced assignments first, then falls back to the flag's weight distribution.
 */
export async function getExamplesDisplayStrategy(
    websiteId: string,
    userId?: string
): Promise<ExamplesDisplayStrategy> {
    // 1️⃣ Check if this user has a forced assignment
    if (userId && forcedAssignments.has(userId)) {
        const forced = forcedAssignments.get(userId)!;
        console.log(`🎯 User ${userId} has forced assignment:`, forced);
        return {
            exampleCount: forced.value,
            variant: forced.variantKey,
            testCondition: "forced-assignment",
        };
    }

    // 2️⃣ Otherwise, fetch from the flag (weight-based distribution)
    const flags = new createFlagsManager({
        config: {
            clientId: websiteId,
            apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
            user: userId ? { userId } : { userId: `anon-${Math.random()}` }, // Generate unique ID for anonymous users
            cache: {
                enabled: true,
                ttl: 15, // Cache for 15 seconds (good for dev)
            },
            debug: process.env.NODE_ENV === "development",
        },
    });

    try {
        const result = await flags.getFlag("examples-display-strategy");
        console.log("🚀 Flag result:", result);

        if (!result.enabled) {
            return {
                exampleCount: 6,
                variant: "fallback-all",
                testCondition: "flag-disabled",
            };
        }

        const exampleCount = Number(result.value) || 0;

        return {
            exampleCount,
            variant: result.variant || "unknown",
            testCondition: "weight-based",
        };
    } catch (error) {
        console.error("❌ Error fetching examples display flag:", error);
        return {
            exampleCount: 6,
            variant: "error-fallback",
            testCondition: "error",
        };
    }
}

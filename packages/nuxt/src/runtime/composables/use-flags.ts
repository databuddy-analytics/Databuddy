import { useFlags as useFlagsVue } from "@databuddy/sdk/vue";
import type { FlagResult, FlagsConfig, FlagState } from "@databuddy/sdk/vue";

export function useFlags(): ReturnType<typeof useFlagsVue> {
	if (!import.meta.client) {
		// Create a new object per call to avoid cross-request state leakage in SSR.
		return {
			getFlag: (_key: string): FlagState => ({
				on: false,
				status: "loading" as const,
				loading: true,
			}),
			fetchAllFlags: () => Promise.resolve(),
			updateUser: (_user: FlagsConfig["user"]) => {},
			refresh: (_forceClear?: boolean) => Promise.resolve(),
			updateConfig: (_config: FlagsConfig) => {},
			memoryFlags: {} as Record<string, FlagResult>,
		};
	}
	// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable SSR guard, not a React hook
	return useFlagsVue();
}

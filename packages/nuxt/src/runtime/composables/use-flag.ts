import { computed, type ComputedRef } from "vue";
import { useFlag as useFlagVue } from "@databuddy/sdk/vue";
import type { FlagState } from "@databuddy/sdk/vue";

export function useFlag(key: string) {
	if (!import.meta.client) {
		// Create a new object per call to avoid cross-request state leakage in SSR.
		const fallback: FlagState = { on: false, status: "loading", loading: true };
		return {
			on: computed(() => fallback.on) as ComputedRef<boolean>,
			loading: computed(() => fallback.loading) as ComputedRef<boolean>,
			state: computed(() => fallback) as ComputedRef<FlagState>,
		};
	}
	// biome-ignore lint/correctness/useHookAtTopLevel: Vue composable SSR guard, not a React hook
	return useFlagVue(key);
}

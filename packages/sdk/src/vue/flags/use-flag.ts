import { type ComputedRef, computed, ref, watchEffect } from 'vue';
import type { FlagState } from '../../core/flags';
import { useFlags } from './flags-plugin';

export interface UseFlagReturn {
	enabled: ComputedRef<boolean>;
	isLoading: ComputedRef<boolean>;
	isReady: ComputedRef<boolean>;
	state: ComputedRef<FlagState>;
}

/**
 * Vue composable for individual flag usage with reactivity
 */
export function useFlag(key: string): UseFlagReturn {
	const { isEnabled } = useFlags();
	const flagState = ref<FlagState>({
		enabled: false,
		isLoading: true,
		isReady: false,
	});

	// Update flag state reactively
	watchEffect(() => {
		flagState.value = isEnabled(key);
	});

	return {
		enabled: computed(() => flagState.value.enabled),
		isLoading: computed(() => flagState.value.isLoading),
		isReady: computed(() => flagState.value.isReady),
		state: computed(() => flagState.value),
	};
}

/**
 * Vue composable for boolean flag checking
 */
export function useBooleanFlag(key: string): ComputedRef<boolean> {
	const { enabled } = useFlag(key);
	return enabled;
}

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
export function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false
	);
}

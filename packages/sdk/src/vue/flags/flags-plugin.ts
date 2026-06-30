import { type App, reactive } from "vue";
import { BrowserFlagStorage } from "@/core/flags/browser-storage";
import { BrowserFlagsManager } from "@/core/flags/flags-manager";
import type { FlagResult, FlagState, FlagsConfig } from "@/core/flags/types";

let manager: BrowserFlagsManager | null = null;
let state: { flags: Record<string, FlagResult> } | null = null;

export function createFlagsPlugin(options: FlagsConfig) {
	return {
		install(app: App) {
			const storage = options.skipStorage
				? undefined
				: new BrowserFlagStorage();
			state = reactive({ flags: {} });
			manager = new BrowserFlagsManager({ config: options, storage });
			const currentManager = manager;
			manager.subscribe(() => {
				if (state) {
					state.flags = manager?.getSnapshot().flags ?? {};
				}
			});

			if (typeof window !== "undefined") {
				window.__databuddyFlags = currentManager;
				app.onUnmount(() => {
					if (window.__databuddyFlags === currentManager) {
						window.__databuddyFlags = undefined;
					}
				});
			}
		},
	};
}

export function useFlags() {
	if (!manager) {
		throw new Error(
			"Flags plugin not installed. Call app.use(createFlagsPlugin(config)) first."
		);
	}

	const m = manager;
	const s = state;
	return {
		getFlag: (key: string): FlagState => m.isEnabled(key),
		fetchAllFlags: () => m.fetchAllFlags(),
		updateUser: (user: FlagsConfig["user"]) => {
			if (user) {
				m.updateUser(user);
			}
		},
		refresh: (forceClear = false) => m.refresh(forceClear),
		updateConfig: (config: FlagsConfig) => m.updateConfig(config),
		memoryFlags: s?.flags ?? {},
	};
}

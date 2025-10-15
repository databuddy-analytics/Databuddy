import { type App, reactive } from 'vue';
import type { FlagResult, FlagState, FlagsConfig } from '../../core/flags';
import { BrowserFlagStorage, CoreFlagsManager } from '../../core/flags';

const FLAGS_SYMBOL = Symbol('flags');

interface VueFlagsState {
	memoryFlags: Record<string, FlagResult>;
	pendingFlags: Set<string>;
}

let globalState: VueFlagsState | null = null;
let globalManager: CoreFlagsManager | null = null;

export interface FlagsPluginOptions extends FlagsConfig {}

export function createFlagsPlugin(options: FlagsPluginOptions) {
	return {
		install(app: App) {
			const storage = options.skipStorage
				? undefined
				: new BrowserFlagStorage();

			const state = reactive<VueFlagsState>({
				memoryFlags: {},
				pendingFlags: new Set(),
			});

			const manager = new CoreFlagsManager({
				config: options,
				storage,
				onFlagsUpdate: (flags) => {
					state.memoryFlags = flags;
				},
			});

			globalManager = manager;
			globalState = state;

			app.provide(FLAGS_SYMBOL, state);
		},
	};
}

export function useFlags() {
	if (!globalState) {
		throw new Error(
			'Flags plugin not installed. Install with app.use(createFlagsPlugin(config))'
		);
	}

	if (!globalManager) {
		throw new Error(
			'Flags manager not initialized. Please reinstall the plugin.'
		);
	}

	const state = globalState;
	const manager = globalManager;

	const isEnabled = (key: string): FlagState => {
		return manager.isEnabled(key);
	};

	const fetchAllFlags = () => {
		return manager.fetchAllFlags();
	};

	const updateUser = (user: FlagsConfig['user']) => {
		manager.updateUser(user);
	};

	const refresh = (forceClear = false): void => {
		manager.refresh(forceClear);
	};

	const updateConfig = (config: FlagsConfig): void => {
		manager.updateConfig(config);
	};

	return {
		isEnabled,
		fetchAllFlags,
		updateUser,
		refresh,
		updateConfig,
		memoryFlags: state.memoryFlags,
	};
}

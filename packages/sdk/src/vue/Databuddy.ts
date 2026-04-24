import { createScript, isScriptInjected } from "@/core";
import { detectClientId } from "@/utils";
import {
	defineComponent,
	onMounted,
	onUnmounted,
	type PropType,
	ref,
	watch,
} from "vue";

const optionalBoolean = { type: Boolean, default: undefined } as const;

export const Databuddy = defineComponent({
	props: {
		apiUrl: String,
		batchSize: Number,
		batchTimeout: Number,
		clientId: String,
		clientSecret: String,
		debug: optionalBoolean,
		disabled: optionalBoolean,
		enableBatching: optionalBoolean,
		enableRetries: optionalBoolean,
		filter: Function as PropType<(event: unknown) => boolean>,
		ignoreBotDetection: optionalBoolean,
		initialRetryDelay: Number,
		maskPatterns: Array as PropType<string[]>,
		maxRetries: Number,
		samplingRate: Number,
		scriptUrl: String,
		sdk: String,
		sdkVersion: String,
		skipPatterns: Array as PropType<string[]>,
		trackAttributes: optionalBoolean,
		trackErrors: optionalBoolean,
		trackHashChanges: optionalBoolean,
		trackInteractions: optionalBoolean,
		trackOutgoingLinks: optionalBoolean,
		trackPerformance: optionalBoolean,
		trackWebVitals: optionalBoolean,
		usePixel: optionalBoolean,
	},
	setup(props) {
		const scriptRef = ref<HTMLScriptElement | null>(null);

		const injectScript = () => {
			const clientId = detectClientId(props.clientId);
			if (!clientId) {
				if (!props.disabled && props.debug) {
					console.warn(
						"Databuddy: No client ID found. Please provide clientId prop or set NEXT_PUBLIC_DATABUDDY_CLIENT_ID / NUXT_PUBLIC_DATABUDDY_CLIENT_ID / VITE_DATABUDDY_CLIENT_ID environment variable."
					);
				}
				return;
			}

			if (props.disabled || isScriptInjected()) {
				return;
			}

			const script = createScript({ ...props, clientId });

			document.head.appendChild(script);
			scriptRef.value = script;
		};

		const removeScript = () => {
			if (scriptRef.value) {
				scriptRef.value.remove();
				scriptRef.value = null;
			}
		};

		onMounted(injectScript);
		onUnmounted(removeScript);

		watch(
			() => props,
			() => {
				removeScript();
				injectScript();
			},
			{ deep: true }
		);

		return () => null;
	},
});

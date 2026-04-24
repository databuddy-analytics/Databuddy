import { defineComponent, onBeforeUnmount, onMounted, watch } from "vue";
import { mountDevtools } from "../ui";

export { mountDevtools } from "../ui";
export type { MountOptions } from "../ui";

export const DatabuddyDevtools = defineComponent({
	name: "DatabuddyDevtools",
	props: {
		enabled: { type: Boolean, default: true },
		keyboardShortcut: { type: Boolean, default: true },
	},
	setup(props) {
		let unmount: (() => void) | null = null;

		const attach = () => {
			if (props.enabled && !unmount) {
				unmount = mountDevtools({ keyboardShortcut: props.keyboardShortcut });
			}
		};
		const detach = () => {
			unmount?.();
			unmount = null;
		};

		onMounted(attach);
		onBeforeUnmount(detach);
		watch(
			() => [props.enabled, props.keyboardShortcut] as const,
			() => {
				detach();
				attach();
			}
		);

		return () => null;
	},
});

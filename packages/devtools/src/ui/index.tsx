import { render } from "preact";
import { store } from "./store";
import { STYLES } from "./styles";
import { Widget } from "./widget";

export interface MountOptions {
	keyboardShortcut?: boolean;
}

interface MountHandle {
	unmount: () => void;
}

let active: MountHandle | null = null;

export function mountDevtools(options: MountOptions = {}): () => void {
	if (typeof document === "undefined") {
		return () => undefined;
	}

	if (active) {
		return active.unmount;
	}

	const host = document.createElement("div");
	host.dataset.databuddyDevtools = "true";
	host.style.cssText =
		"position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;";
	const shadow = host.attachShadow({ mode: "open" });

	const style = document.createElement("style");
	style.textContent = STYLES;
	shadow.appendChild(style);

	const mountPoint = document.createElement("div");
	shadow.appendChild(mountPoint);
	document.documentElement.appendChild(host);

	render(<Widget />, mountPoint);

	const onKeyDown = (event: KeyboardEvent) => {
		if (options.keyboardShortcut === false) {
			return;
		}
		if (
			(event.metaKey || event.ctrlKey) &&
			event.shiftKey &&
			event.key.toLowerCase() === "d"
		) {
			event.preventDefault();
			store.toggleOpen();
		}
		if (event.key === "Escape" && store.getState().open) {
			store.setOpen(false);
		}
	};
	window.addEventListener("keydown", onKeyDown);

	const unmount = () => {
		if (!active) {
			return;
		}
		active = null;
		window.removeEventListener("keydown", onKeyDown);
		render(null, mountPoint);
		host.remove();
	};

	active = { unmount };
	return unmount;
}

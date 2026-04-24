import { MAX_SIZE, MIN_SIZE, store } from "./store";

interface RefObject<T> {
	current: T;
}

const DRAG_THRESHOLD_PX = 4;

type Cleanup = () => void;

export function attachDrag(
	handle: HTMLElement,
	hostRef: RefObject<HTMLElement | null>,
	onTap?: () => void
): Cleanup {
	let pointerStart: { x: number; y: number } | null = null;
	let dx = 0;
	let dy = 0;
	let raf = 0;
	let moved = false;

	const paintOffset = () => {
		raf = 0;
		const host = hostRef.current;
		if (!host) {
			return;
		}
		host.style.setProperty("--drag-x", `${dx}px`);
		host.style.setProperty("--drag-y", `${dy}px`);
	};

	const clearOffset = (host: HTMLElement | null) => {
		if (!host) {
			return;
		}
		host.style.removeProperty("--drag-x");
		host.style.removeProperty("--drag-y");
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!pointerStart) {
			return;
		}
		dx = e.clientX - pointerStart.x;
		dy = e.clientY - pointerStart.y;
		if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
			moved = true;
		}
		if (!raf) {
			raf = requestAnimationFrame(paintOffset);
		}
	};

	const onPointerUp = (e: PointerEvent) => {
		if (!pointerStart) {
			return;
		}
		handle.releasePointerCapture(e.pointerId);
		handle.removeEventListener("pointermove", onPointerMove);
		handle.removeEventListener("pointerup", onPointerUp);
		handle.removeEventListener("pointercancel", onPointerUp);
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}

		const host = hostRef.current;
		host?.removeAttribute("data-dragging");
		if (moved) {
			const start = store.getState().position;
			const dropped = { x: start.x + dx, y: start.y + dy };
			clearOffset(host);
			store.snapToCorner(dropped);
		} else {
			clearOffset(host);
			onTap?.();
		}
		pointerStart = null;
	};

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0) {
			return;
		}
		const target = e.target as HTMLElement | null;
		if (target?.closest("button, a, input, select, textarea, [data-no-drag]")) {
			return;
		}
		pointerStart = { x: e.clientX, y: e.clientY };
		dx = 0;
		dy = 0;
		moved = false;
		hostRef.current?.setAttribute("data-dragging", "true");
		handle.setPointerCapture(e.pointerId);
		handle.addEventListener("pointermove", onPointerMove);
		handle.addEventListener("pointerup", onPointerUp);
		handle.addEventListener("pointercancel", onPointerUp);
	};

	handle.addEventListener("pointerdown", onPointerDown);
	return () => handle.removeEventListener("pointerdown", onPointerDown);
}

export function attachResize(
	handle: HTMLElement,
	shellRef: RefObject<HTMLElement | null>
): Cleanup {
	let pointerStart: { x: number; y: number } | null = null;
	let startSize: { w: number; h: number } | null = null;
	let nextSize: { w: number; h: number } | null = null;
	let raf = 0;

	const paintSize = () => {
		raf = 0;
		const shell = shellRef.current;
		if (!(shell && nextSize)) {
			return;
		}
		shell.style.width = `${nextSize.w}px`;
		shell.style.height = `${nextSize.h}px`;
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!(pointerStart && startSize)) {
			return;
		}
		const dx = e.clientX - pointerStart.x;
		const dy = e.clientY - pointerStart.y;
		nextSize = {
			w: Math.min(Math.max(MIN_SIZE.w, startSize.w + dx), MAX_SIZE.w),
			h: Math.min(Math.max(MIN_SIZE.h, startSize.h + dy), MAX_SIZE.h),
		};
		if (!raf) {
			raf = requestAnimationFrame(paintSize);
		}
	};

	const onPointerUp = (e: PointerEvent) => {
		if (!pointerStart) {
			return;
		}
		handle.releasePointerCapture(e.pointerId);
		handle.removeEventListener("pointermove", onPointerMove);
		handle.removeEventListener("pointerup", onPointerUp);
		handle.removeEventListener("pointercancel", onPointerUp);
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
		if (nextSize) {
			store.setSize(nextSize);
		}
		pointerStart = null;
		startSize = null;
		nextSize = null;
	};

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0) {
			return;
		}
		pointerStart = { x: e.clientX, y: e.clientY };
		startSize = store.getState().size;
		nextSize = startSize;
		handle.setPointerCapture(e.pointerId);
		handle.addEventListener("pointermove", onPointerMove);
		handle.addEventListener("pointerup", onPointerUp);
		handle.addEventListener("pointercancel", onPointerUp);
		e.stopPropagation();
	};

	handle.addEventListener("pointerdown", onPointerDown);
	return () => handle.removeEventListener("pointerdown", onPointerDown);
}

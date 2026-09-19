import type { BaseTracker } from "../core/tracker";

const interactionEvents = [
	"mousedown",
	"keydown",
	"scroll",
	"touchstart",
	"click",
	"keypress",
	"mousemove",
] as const;

const counterByEvent: Partial<
	Record<
		(typeof interactionEvents)[number],
		"clickCount" | "keyCount" | "scrollCount"
	>
> = {
	click: "clickCount",
	keydown: "keyCount",
	scroll: "scrollCount",
};

const RAGE_CLICK_WINDOW_MS = 1000;
const RAGE_CLICK_THRESHOLD = 3;
const DEAD_CLICK_WINDOW_MS = 500;

const INTERACTIVE_SELECTOR =
	'a,button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[data-track]';

const FORM_FIELD_SELECTOR = "input,select,textarea";

const LEAVES_DOCUMENT_HREF = /^(?:mailto|tel|sms):/i;

function leavesDocument(event: MouseEvent, element: Element): boolean {
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
		return true;
	}
	const anchor = element.closest("a");
	if (!anchor) {
		return false;
	}
	return (
		anchor.target === "_blank" ||
		anchor.hasAttribute("download") ||
		LEAVES_DOCUMENT_HREF.test(anchor.getAttribute("href") ?? "")
	);
}

export function initInteractionTracking(tracker: BaseTracker): () => void {
	if (tracker.isServer()) {
		return () => {};
	}

	const cleanupFns: Array<() => void> = [];

	for (const eventType of interactionEvents) {
		const counter = counterByEvent[eventType];
		const handler = () => {
			tracker.interactionCount += 1;
			if (counter) {
				tracker[counter] += 1;
			}
		};

		window.addEventListener(eventType, handler, { passive: true });
		cleanupFns.push(() => window.removeEventListener(eventType, handler));
	}

	let lastClickTarget: EventTarget | null = null;
	let lastClickAt = 0;
	let clickStreak = 0;

	const deadClickTimers = new Set<ReturnType<typeof setTimeout>>();
	let lastMutationAt = 0;

	const mutationObserver =
		typeof MutationObserver === "undefined"
			? null
			: new MutationObserver(() => {
					lastMutationAt = Date.now();
				});

	const countRageClick = (target: EventTarget | null, now: number) => {
		if (
			target === lastClickTarget &&
			now - lastClickAt <= RAGE_CLICK_WINDOW_MS
		) {
			clickStreak += 1;
			if (clickStreak === RAGE_CLICK_THRESHOLD) {
				tracker.rageClickCount += 1;
			}
		} else {
			clickStreak = 1;
		}

		lastClickTarget = target;
		lastClickAt = now;
	};

	const watchForDeadClick = (event: MouseEvent, now: number) => {
		const element = event.target instanceof Element ? event.target : null;
		if (
			!(mutationObserver && element?.closest(INTERACTIVE_SELECTOR)) ||
			leavesDocument(event, element)
		) {
			return;
		}

		const hrefAtClick = window.location.href;
		if (deadClickTimers.size === 0) {
			mutationObserver.observe(document, {
				subtree: true,
				childList: true,
				attributes: true,
			});
		}

		const timer = setTimeout(() => {
			deadClickTimers.delete(timer);
			if (deadClickTimers.size === 0) {
				mutationObserver.disconnect();
			}
			if (lastMutationAt < now && window.location.href === hrefAtClick) {
				tracker.deadClickCount += 1;
			}
		}, DEAD_CLICK_WINDOW_MS);
		deadClickTimers.add(timer);
	};

	const behaviourClickHandler = (event: MouseEvent) => {
		const now = Date.now();
		countRageClick(event.target, now);
		watchForDeadClick(event, now);
	};

	let touchedFields = new WeakSet<Element>();
	let touchedFieldsPageStart = tracker.pageStartTime;

	const focusHandler = (event: FocusEvent) => {
		const element = event.target instanceof Element ? event.target : null;
		if (!(element?.matches(FORM_FIELD_SELECTOR) && element.closest("form"))) {
			return;
		}
		if (touchedFieldsPageStart !== tracker.pageStartTime) {
			touchedFields = new WeakSet<Element>();
			touchedFieldsPageStart = tracker.pageStartTime;
		}
		if (touchedFields.has(element)) {
			return;
		}

		touchedFields.add(element);
		tracker.formFieldCount += 1;
	};

	const submitHandler = () => {
		tracker.formSubmitCount += 1;
	};

	document.addEventListener("click", behaviourClickHandler, { passive: true });
	document.addEventListener("focusin", focusHandler, { passive: true });
	document.addEventListener("submit", submitHandler, { passive: true });

	cleanupFns.push(() => {
		document.removeEventListener("click", behaviourClickHandler);
		document.removeEventListener("focusin", focusHandler);
		document.removeEventListener("submit", submitHandler);
		for (const timer of deadClickTimers) {
			clearTimeout(timer);
		}
		deadClickTimers.clear();
		mutationObserver?.disconnect();
	});

	return () => {
		for (const cleanup of cleanupFns) {
			cleanup();
		}
	};
}

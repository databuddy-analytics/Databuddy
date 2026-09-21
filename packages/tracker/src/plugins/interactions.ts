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
	Record<(typeof interactionEvents)[number], "clickCount" | "keyCount">
> = {
	click: "clickCount",
	keydown: "keyCount",
};

const RAGE_CLICK_WINDOW_MS = 1000;
const RAGE_CLICK_THRESHOLD = 3;
const RAGE_CLICK_RADIUS_PX = 12;
const DEAD_CLICK_WINDOW_MS = 500;
const SCROLL_GESTURE_IDLE_MS = 500;

const MUTATION_ATTRIBUTE_FILTER = [
	"class",
	"style",
	"hidden",
	"disabled",
	"open",
	"checked",
	"value",
	"selected",
	"aria-expanded",
	"aria-selected",
	"aria-checked",
	"aria-hidden",
	"aria-pressed",
	"data-state",
];

const INTERACTIVE_SELECTOR =
	'a,button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[data-track]';

const FORM_FIELD_SELECTOR = "input,select,textarea";

const LEAVES_DOCUMENT_HREF = /^(?:mailto|tel|sms):/i;

function leavesDocument(event: MouseEvent, element: Element): boolean {
	if (
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	) {
		return true;
	}
	const anchor = element.closest("a");
	if (!anchor) {
		return false;
	}
	return (
		anchor.target.toLowerCase() === "_blank" ||
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

	let lastScrollAt = 0;
	const scrollHandler = () => {
		const now = Date.now();
		if (now - lastScrollAt > SCROLL_GESTURE_IDLE_MS) {
			tracker.scrollCount += 1;
		}
		lastScrollAt = now;
	};
	window.addEventListener("scroll", scrollHandler, { passive: true });
	cleanupFns.push(() => window.removeEventListener("scroll", scrollHandler));

	let lastClickAt = 0;
	let lastClickX = 0;
	let lastClickY = 0;
	let clickStreak = 0;

	const deadClickTimers = new Set<ReturnType<typeof setTimeout>>();
	let mutationSeq = 0;

	const mutationObserver =
		typeof MutationObserver === "undefined"
			? null
			: new MutationObserver(() => {
					mutationSeq += 1;
				});

	const countRageClick = (event: MouseEvent, now: number) => {
		const repeated =
			now - lastClickAt <= RAGE_CLICK_WINDOW_MS &&
			Math.abs(event.clientX - lastClickX) <= RAGE_CLICK_RADIUS_PX &&
			Math.abs(event.clientY - lastClickY) <= RAGE_CLICK_RADIUS_PX;

		if (repeated) {
			clickStreak += 1;
			if (clickStreak === RAGE_CLICK_THRESHOLD) {
				tracker.rageClickCount += 1;
			}
		} else {
			clickStreak = 1;
		}

		lastClickAt = now;
		lastClickX = event.clientX;
		lastClickY = event.clientY;
	};

	const watchForDeadClick = (event: MouseEvent) => {
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
				attributeFilter: MUTATION_ATTRIBUTE_FILTER,
			});
		}

		const seqAtClick = mutationSeq;
		const timer = setTimeout(() => {
			deadClickTimers.delete(timer);
			if (deadClickTimers.size === 0) {
				mutationObserver.disconnect();
			}
			if (mutationSeq === seqAtClick && window.location.href === hrefAtClick) {
				tracker.deadClickCount += 1;
			}
		}, DEAD_CLICK_WINDOW_MS);
		deadClickTimers.add(timer);
	};

	const behaviourClickHandler = (event: MouseEvent) => {
		countRageClick(event, Date.now());
		watchForDeadClick(event);
	};

	let touchedFields = new WeakSet<Element>();
	let touchedFieldsPageStart = tracker.pageStartTime;

	const focusHandler = (event: FocusEvent) => {
		const element = event.target instanceof Element ? event.target : null;
		if (!element?.matches(FORM_FIELD_SELECTOR)) {
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

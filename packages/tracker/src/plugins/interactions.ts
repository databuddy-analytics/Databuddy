import type { BaseTracker } from "../core/tracker";

type InteractionCounter = "clickCount" | "keyCount" | "scrollCount";

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
	Record<(typeof interactionEvents)[number], InteractionCounter>
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

	let deadClickTimer: ReturnType<typeof setTimeout> | undefined;
	let awaitingDeadClickCheck = false;
	let mutatedSinceClick = false;

	const mutationObserver =
		typeof MutationObserver === "undefined"
			? null
			: new MutationObserver(() => {
					mutatedSinceClick = true;
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

	const watchForDeadClick = (target: EventTarget | null) => {
		if (!mutationObserver || awaitingDeadClickCheck) {
			return;
		}

		const element = target instanceof Element ? target : null;
		if (!element?.closest(INTERACTIVE_SELECTOR)) {
			return;
		}

		const hrefAtClick = window.location.href;
		awaitingDeadClickCheck = true;
		mutatedSinceClick = false;
		mutationObserver.observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
		});

		deadClickTimer = setTimeout(() => {
			mutationObserver.disconnect();
			awaitingDeadClickCheck = false;

			if (!mutatedSinceClick && window.location.href === hrefAtClick) {
				tracker.deadClickCount += 1;
			}
		}, DEAD_CLICK_WINDOW_MS);
	};

	const behaviourClickHandler = (event: MouseEvent) => {
		const now = Date.now();
		countRageClick(event.target, now);
		watchForDeadClick(event.target);
	};

	const touchedFields = new WeakSet<Element>();

	const focusHandler = (event: FocusEvent) => {
		const element = event.target instanceof Element ? event.target : null;
		if (!element?.matches(FORM_FIELD_SELECTOR)) {
			return;
		}
		if (!element.closest("form") || touchedFields.has(element)) {
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
		clearTimeout(deadClickTimer);
		mutationObserver?.disconnect();
	});

	return () => {
		for (const cleanup of cleanupFns) {
			cleanup();
		}
	};
}

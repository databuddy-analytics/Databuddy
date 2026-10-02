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
export const DEAD_CLICK_WINDOW_MS = 2500;
const CLICK_SCROLL_WINDOW_MS = 300;

const INTERACTIVE_SELECTOR =
	'a,button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[data-track]';

const NATIVE_CONTROL_SELECTOR =
	'label,select,textarea,input:not([type="button"],[type="submit"],[type="reset"],[type="image"])';

const FOLLOWABLE_LINK_SELECTOR = 'a[href]:not([href^="javascript:"])';

const FORM_FIELD_SELECTOR = "input,select,textarea";

const GENERATED_TOKEN = /^[:_-]|\d{3,}|[0-9a-f]{8,}/i;
const TARGET_MAX_LENGTH = 32;

function normalizeLabel(value: string | null | undefined): string {
	const text = value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
	return text
		.replace(/\S+@\S+/g, "#")
		.replace(/\d+/g, "#")
		.slice(0, TARGET_MAX_LENGTH);
}

function stableAttribute(element: Element, name: string): string | null {
	const value = element.getAttribute(name);
	return value && !GENERATED_TOKEN.test(value) ? value : null;
}

export function describeTarget(element: Element): string {
	const tag = element.tagName.toLowerCase();
	const kind =
		element.getAttribute("role") ??
		(tag === "input" ? (element.getAttribute("type") ?? "text") : null);
	const prefix = kind ? `${tag}:${kind}` : tag;
	const name =
		element.getAttribute("data-track") ??
		element.getAttribute("aria-label") ??
		stableAttribute(element, "name") ??
		stableAttribute(element, "id") ??
		(element.matches(FORM_FIELD_SELECTOR)
			? (element as HTMLInputElement).labels?.[0]?.textContent ||
				element.getAttribute("placeholder")
			: null);
	const label = normalizeLabel(name);
	return `${prefix}:${label || "unnamed"}`;
}

export function initInteractionTracking(tracker: BaseTracker): () => void {
	if (tracker.isServer()) {
		return () => {};
	}

	const cleanupFns: Array<() => void> = [];
	const listen = (
		target: EventTarget,
		type: string,
		handler: (event: Event) => void,
		capture = false
	) => {
		target.addEventListener(type, handler, { capture, passive: true });
		cleanupFns.push(() => target.removeEventListener(type, handler, capture));
	};

	for (const eventType of interactionEvents) {
		const counter = counterByEvent[eventType];
		listen(window, eventType, () => {
			tracker.interactionCount += 1;
			tracker.firstInteractionAt ||= Date.now();
			if (counter) {
				tracker[counter] += 1;
			}
		});
	}

	let lastClickTarget: EventTarget | null = null;
	let lastClickAt = 0;
	let clickStreak = 0;

	let lastDeadClickCandidateAt = 0;
	const pendingDeadClicks = new Set<ReturnType<typeof setTimeout>>();

	const mutationObserver =
		typeof MutationObserver === "undefined"
			? null
			: new MutationObserver(() => settleDeadClicks());

	const settleDeadClicks = () => {
		for (const timer of pendingDeadClicks) {
			clearTimeout(timer);
		}
		pendingDeadClicks.clear();
		mutationObserver?.disconnect();
	};

	const countRageClick = (target: EventTarget | null, now: number) => {
		clickStreak =
			target === lastClickTarget && now - lastClickAt <= RAGE_CLICK_WINDOW_MS
				? clickStreak + 1
				: 1;
		lastClickTarget = target;
		lastClickAt = now;

		if (clickStreak !== RAGE_CLICK_THRESHOLD || !(target instanceof Element)) {
			return;
		}
		const interactive = target.closest(INTERACTIVE_SELECTOR);
		const isEditingOrSelectingText = interactive
			? interactive.matches(NATIVE_CONTROL_SELECTOR)
			: Boolean(getSelection()?.toString());
		if (isEditingOrSelectingText) {
			return;
		}
		tracker.rageClickCount += 1;
		tracker.rageClickTarget = describeTarget(interactive ?? target);
	};

	const watchForDeadClick = (event: Event, now: number) => {
		const interactive =
			event.target instanceof Element
				? event.target.closest(INTERACTIVE_SELECTOR)
				: null;
		if (
			!(mutationObserver && interactive) ||
			interactive.matches(NATIVE_CONTROL_SELECTOR)
		) {
			return;
		}

		const hrefAtClick = location.href;
		lastDeadClickCandidateAt = now;
		if (pendingDeadClicks.size === 0) {
			mutationObserver.observe(document, {
				subtree: true,
				childList: true,
				attributes: true,
				characterData: true,
			});
		}

		const timer = setTimeout(() => {
			pendingDeadClicks.delete(timer);
			if (pendingDeadClicks.size === 0) {
				mutationObserver.disconnect();
			}
			const link = interactive.closest<HTMLAnchorElement>(
				FOLLOWABLE_LINK_SELECTOR
			);
			const browserFollowsLink =
				link && (!event.defaultPrevented || link.href === hrefAtClick);
			if (browserFollowsLink || location.href !== hrefAtClick) {
				return;
			}
			tracker.deadClickCount += 1;
			tracker.deadClickTarget = describeTarget(interactive);
		}, DEAD_CLICK_WINDOW_MS);
		pendingDeadClicks.add(timer);
	};

	listen(
		window,
		"click",
		(event) => {
			const now = Date.now();
			countRageClick(event.target, now);
			watchForDeadClick(event, now);
		},
		true
	);

	listen(window, "blur", settleDeadClicks);
	listen(document, "invalid", settleDeadClicks, true);
	listen(document, "toggle", settleDeadClicks, true);
	listen(
		document,
		"scroll",
		() => {
			if (Date.now() - lastDeadClickCandidateAt < CLICK_SCROLL_WINDOW_MS) {
				settleDeadClicks();
			}
		},
		true
	);

	listen(document, "copy", () => {
		tracker.copyCount += 1;
		settleDeadClicks();
	});

	let touchedFields = new WeakSet<Element>();
	let touchedFieldsPageStart = tracker.pageStartTime;

	listen(document, "focusin", (event) => {
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
		tracker.lastFormField = describeTarget(element);
	});

	listen(document, "submit", (event) => {
		tracker.formSubmitCount += 1;
		setTimeout(() => {
			if (!event.defaultPrevented) {
				settleDeadClicks();
			}
		});
	});

	cleanupFns.push(settleDeadClicks);

	return () => {
		for (const cleanup of cleanupFns) {
			cleanup();
		}
	};
}

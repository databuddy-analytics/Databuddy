import type { BaseTracker } from "../core/tracker";

const interactionEvents = [
	"mousedown",
	"keydown",
	"scroll",
	"touchstart",
	"click",
] as const;

const RAGE_CLICK_WINDOW_MS = 1000;
const RAGE_CLICK_THRESHOLD = 3;
const RAGE_CLICK_RADIUS_PX = 12;
const DEAD_CLICK_WINDOW_MS = 500;

const MUTATION_ATTRIBUTE_FILTER = [
	"class",
	"style",
	"hidden",
	"disabled",
	"open",
	"checked",
	"aria-expanded",
	"data-state",
];

const INTERACTIVE_SELECTOR =
	'a,button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[data-track]';

const FORM_FIELD_SELECTOR = "input,select,textarea";

const LEAVES_DOCUMENT_HREF = /^(?:mailto|tel|sms):/i;
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

function fieldLabel(element: Element): string | null {
	return (
		(element as HTMLInputElement).labels?.[0]?.textContent ||
		element.getAttribute("placeholder")
	);
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
			? fieldLabel(element)
			: element.matches("a,button,summary,[role]")
				? element.textContent
				: null);
	const label = normalizeLabel(name);
	return `${prefix}:${label || "unnamed"}`;
}

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
		const handler = () => {
			tracker.interactionCount += 1;
			tracker.firstInteractionAt ||= Date.now();
			if (eventType === "click") {
				tracker.clickCount += 1;
			}
		};

		window.addEventListener(eventType, handler, { passive: true });
		cleanupFns.push(() => window.removeEventListener(eventType, handler));
	}

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
				const target = event.target;
				if (target instanceof Element) {
					tracker.rageClickTarget = describeTarget(
						target.closest(INTERACTIVE_SELECTOR) ?? target
					);
				}
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
		const interactive = element?.closest(INTERACTIVE_SELECTOR);
		if (
			!(mutationObserver && element && interactive) ||
			leavesDocument(event, element)
		) {
			return;
		}

		const hrefAtClick = window.location.href;
		if (deadClickTimers.size === 0) {
			mutationObserver.observe(document, {
				subtree: true,
				childList: true,
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
				tracker.deadClickTarget = describeTarget(interactive);
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
		tracker.lastFormField = describeTarget(element);
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

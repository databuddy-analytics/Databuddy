import type { BaseTracker } from "../core/tracker";
import { maskPathname } from "../core/utils";

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
const RESPONSE_GRACE_MS = 300;

const INTERACTIVE_SELECTOR =
	'a,button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[data-track]';

const UNOBSERVABLE_RESPONSE_SELECTOR =
	'html,body,canvas,video,audio,label,select,textarea,[aria-selected="true"],[aria-expanded="true"],[aria-pressed="true"],[role="radio"][aria-checked="true"],[role="menuitemradio"][aria-checked="true"],[contenteditable],[contenteditable] *,input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])';

const CONTAINER_SELECTOR =
	'nav,header,footer,aside,main,form,dialog,table,[role="dialog"],[role="navigation"],[role="menu"],[role="tablist"],[role="toolbar"]';

const FOLLOWABLE_LINK_SELECTOR = 'a[href]:not([href^="javascript:"])';

const FORM_FIELD_SELECTOR = "input,select,textarea";

const GENERATED_TOKEN = /^[:_-]|\d{3,}|[0-9a-f]{8,}|[:_«]r[0-9a-z]*[:_»]/i;
const READABLE_FRAGMENT = /^#[a-z][\w-]*$/i;
const COUNTRY_SUFFIX =
	/^(?:ac|co|com|edu|go|gov|ne|net|or|org)\.(?:ar|au|br|cn|eg|hk|id|il|in|jp|ke|kr|mx|my|ng|nz|pe|ph|sa|sg|th|tr|tw|ua|uk|vn|za)$/;
const TARGET_MAX_LENGTH = 32;
const DESCRIPTOR_MAX_LENGTH = 64;

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

function nameOf(element: Element): string | null {
	return (
		element.getAttribute("data-track") ??
		element.getAttribute("aria-label") ??
		stableAttribute(element, "data-testid") ??
		stableAttribute(element, "name") ??
		stableAttribute(element, "id")
	);
}

function isGeneratedSegment(segment: string): boolean {
	return (
		GENERATED_TOKEN.test(segment) ||
		segment.includes("%") ||
		(segment.length > 20 && !segment.includes("-"))
	);
}

function linkDestination(
	link: HTMLAnchorElement,
	maskPatterns: readonly string[] | undefined
): string | null {
	if (!link.protocol.startsWith("http")) {
		return link.protocol.slice(0, -1);
	}
	if (link.host !== location.host) {
		const labels = link.hostname.split(".");
		const isCountrySuffix = COUNTRY_SUFFIX.test(labels.slice(-2).join("."));
		return labels
			.slice(labels.length > 2 && isCountrySuffix ? -3 : -2)
			.join(".");
	}
	if (
		link.pathname === location.pathname &&
		(link.hash || link.href.endsWith("#"))
	) {
		return READABLE_FRAGMENT.test(link.hash) &&
			!isGeneratedSegment(link.hash.slice(1))
			? link.hash
			: null;
	}
	const [section, ...rest] = maskPathname(link.pathname, maskPatterns)
		.split("/")
		.filter(Boolean);
	if (!section) {
		return "/";
	}
	return `/${isGeneratedSegment(section) ? "*" : section}${rest.length ? "/*" : ""}`;
}

function containerName(node: Element): string | null {
	return (
		node.getAttribute("data-track") ??
		stableAttribute(node, "data-testid") ??
		stableAttribute(node, "id") ??
		(node.matches('nav,[role="navigation"]')
			? node.getAttribute("aria-label")
			: null)
	);
}

function describeContainer(element: Element): string {
	for (
		let node = element.parentElement;
		node && node !== document.body;
		node = node.parentElement
	) {
		const name = normalizeLabel(containerName(node));
		if (
			(name && node.parentElement !== document.body) ||
			node.matches(CONTAINER_SELECTOR)
		) {
			const kind = node.getAttribute("role") ?? node.tagName.toLowerCase();
			return ` in ${kind}${name ? `:${name}` : ""}`;
		}
	}
	return "";
}

export function describeTarget(
	element: Element,
	maskPatterns?: readonly string[]
): string {
	const tag = element.tagName.toLowerCase();
	const kind =
		element.getAttribute("role") ??
		(tag === "input" ? (element.getAttribute("type") ?? "text") : null);
	const prefix = kind ? `${tag}:${kind}` : tag;
	const label = normalizeLabel(
		nameOf(element) ??
			(element.matches(FORM_FIELD_SELECTOR)
				? (element as HTMLInputElement).labels?.[0]?.textContent ||
					element.getAttribute("placeholder")
				: element instanceof HTMLAnchorElement && element.href
					? linkDestination(element, maskPatterns)
					: null)
	);
	const descriptor = label
		? `${prefix}:${label}`
		: `${prefix}:unnamed${describeContainer(element)}`;
	return descriptor.slice(0, DESCRIPTOR_MAX_LENGTH);
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

	const maskPatterns = tracker.options.maskPatterns;
	let lastClickSubject: Element | null = null;
	let lastClickAt = 0;
	let lastDeadClickCandidateAt = 0;
	let lastResponseAt = 0;
	let clickStreak = 0;
	let streakStartedAt = 0;
	let streakPageStart = 0;
	let streakSelectsText = false;
	const pendingClicks = new Set<ReturnType<typeof setTimeout>>();

	const mutationObserver =
		typeof MutationObserver === "undefined"
			? null
			: new MutationObserver((records) => {
					if (
						records.some((record) => !document.head?.contains(record.target))
					) {
						markResponse();
					}
				});

	const markResponse = () => {
		lastResponseAt = Date.now();
		for (const timer of pendingClicks) {
			clearTimeout(timer);
		}
		pendingClicks.clear();
		mutationObserver?.disconnect();
	};

	const markResponseIfJustClicked = () => {
		const now = Date.now();
		if (now - lastDeadClickCandidateAt < RESPONSE_GRACE_MS) {
			markResponse();
		} else if (now - lastClickAt < RESPONSE_GRACE_MS) {
			lastResponseAt = now;
		}
	};

	const countRageClick = (target: Element, now: number) => {
		const interactive = target.closest(INTERACTIVE_SELECTOR);
		const subject = interactive ?? target.closest("svg") ?? target;
		const continuesStreak =
			subject === lastClickSubject &&
			now - lastClickAt <= RAGE_CLICK_WINDOW_MS &&
			tracker.pageStartTime === streakPageStart;
		clickStreak = continuesStreak ? clickStreak + 1 : 1;
		if (!continuesStreak) {
			streakStartedAt = now;
		}
		streakPageStart = tracker.pageStartTime;
		streakSelectsText =
			(clickStreak > 1 && streakSelectsText) ||
			Boolean(getSelection()?.toString());
		lastClickSubject = subject;
		lastClickAt = now;

		if (clickStreak !== RAGE_CLICK_THRESHOLD) {
			return;
		}
		const isOrdinaryInteraction =
			lastResponseAt >= streakStartedAt ||
			(interactive ?? target).matches(UNOBSERVABLE_RESPONSE_SELECTOR) ||
			(!interactive && streakSelectsText);
		if (isOrdinaryInteraction) {
			return;
		}
		tracker.rageClickCount += 1;
		tracker.rageClickTarget = describeTarget(subject, maskPatterns);
	};

	const watchForResponse = (event: Event, target: Element, now: number) => {
		if (!mutationObserver) {
			return;
		}
		const interactive = target.closest(INTERACTIVE_SELECTOR);
		const deadClickCandidate =
			interactive && !interactive.matches(UNOBSERVABLE_RESPONSE_SELECTOR)
				? interactive
				: null;
		if (deadClickCandidate) {
			lastDeadClickCandidateAt = now;
		}
		const hrefAtClick = location.href;
		const pageStartAtClick = tracker.pageStartTime;
		mutationObserver.observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});

		const timer = setTimeout(() => {
			pendingClicks.delete(timer);
			if (pendingClicks.size === 0) {
				mutationObserver.disconnect();
			}
			if (!deadClickCandidate) {
				return;
			}
			const link = deadClickCandidate.closest<HTMLAnchorElement>(
				FOLLOWABLE_LINK_SELECTOR
			);
			const browserFollowsLink =
				link && (!event.defaultPrevented || link.href === hrefAtClick);
			if (
				browserFollowsLink ||
				location.href !== hrefAtClick ||
				tracker.pageStartTime !== pageStartAtClick
			) {
				return;
			}
			tracker.deadClickCount += 1;
			tracker.deadClickTarget = describeTarget(
				deadClickCandidate,
				maskPatterns
			);
		}, DEAD_CLICK_WINDOW_MS);
		pendingClicks.add(timer);
	};

	listen(
		window,
		"click",
		(event) => {
			if (!(event.isTrusted && event.target instanceof Element)) {
				return;
			}
			const now = Date.now();
			watchForResponse(event, event.target, now);
			countRageClick(event.target, now);
		},
		true
	);

	listen(window, "blur", markResponseIfJustClicked);
	for (const type of ["change", "invalid", "scroll", "toggle"]) {
		listen(document, type, markResponseIfJustClicked, true);
	}
	if ("navigation" in window) {
		listen(
			window.navigation as EventTarget,
			"navigate",
			markResponseIfJustClicked
		);
	}

	listen(document, "copy", () => {
		tracker.copyCount += 1;
		markResponseIfJustClicked();
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
		tracker.lastFormField = describeTarget(element, maskPatterns);
	});

	listen(document, "submit", (event) => {
		tracker.formSubmitCount += 1;
		setTimeout(() => {
			if (!event.defaultPrevented) {
				markResponseIfJustClicked();
			}
		});
	});

	cleanupFns.push(markResponse);

	return () => {
		for (const cleanup of cleanupFns) {
			cleanup();
		}
	};
}

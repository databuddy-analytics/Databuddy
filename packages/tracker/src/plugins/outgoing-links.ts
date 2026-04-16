import type { BaseTracker } from "../core/tracker";
import { generateUUIDv4 } from "../core/utils";

export function initOutgoingLinksTracking(tracker: BaseTracker): () => void {
	if (tracker.isServer()) {
		return () => {};
	}

	const currentOrigin = window.location.origin;

	const handler = (e: MouseEvent) => {
		if (tracker.options.disabled || tracker.isLikelyBot) {
			return;
		}

		const target = e.target as Element | null;
		if (!target) {
			return;
		}

		const link = target.closest("a") as HTMLAnchorElement | null;
		if (!link?.href) {
			return;
		}

		try {
			const url = new URL(link.href, window.location.href);

			if (!url.protocol.startsWith("http")) {
				return;
			}

			if (url.origin === currentOrigin) {
				return;
			}

			tracker.api.fetch(
				"/",
				{
					type: "outgoing_link",
					eventId: generateUUIDv4(),
					anonymousId: tracker.anonymousId,
					sessionId: tracker.sessionId,
					timestamp: Date.now(),
					href: link.href,
					text: link.innerText || link.title || "",
					...tracker.getBaseContext(),
				},
				{ keepalive: true },
				{ client_id: tracker.options.clientId }
			);
		} catch {
			return;
		}
	};

	document.addEventListener("click", handler);

	return () => {
		document.removeEventListener("click", handler);
	};
}

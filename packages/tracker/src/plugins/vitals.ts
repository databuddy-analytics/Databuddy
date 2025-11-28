import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import type { BaseTracker } from "../core/tracker";
import { generateUUIDv4, logger } from "../core/utils";

export function initWebVitalsTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	const metrics: {
		fcp: number | undefined;
		lcp: number | undefined;
		cls: number | undefined;
		inp: number | undefined;
		ttfb: number | undefined;
	} = {
		fcp: undefined,
		lcp: undefined,
		cls: undefined,
		inp: undefined,
		ttfb: undefined,
	};

	const sendVitals = () => {
		if (!Object.values(metrics).some((m) => m !== undefined)) {
			return;
		}

		const clamp = (v: number | undefined) =>
			typeof v === "number" ? Math.min(60_000, Math.max(0, v)) : v;

		const payload = {
			eventId: generateUUIDv4(),
			anonymousId: tracker.anonymousId,
			sessionId: tracker.sessionId,
			timestamp: Date.now(),
			fcp: clamp(metrics.fcp),
			lcp: clamp(metrics.lcp),
			cls: clamp(metrics.cls),
			inp: metrics.inp,
			ttfb: clamp(metrics.ttfb),
			url: window.location.href,
		};

		logger.log("Sending web vitals", payload);

		tracker.sendBeacon(payload);
	};

	const handleMetric = (metric: Metric) => {
		switch (metric.name) {
			case "FCP":
				metrics.fcp = Math.round(metric.value);
				break;
			case "LCP":
				metrics.lcp = Math.round(metric.value);
				break;
			case "CLS":
				metrics.cls = metric.value; // CLS is a score, not ms, so keep decimals if needed, but usually small
				break;
			case "INP":
				metrics.inp = Math.round(metric.value);
				break;
			case "TTFB":
				metrics.ttfb = Math.round(metric.value);
				break;
			default:
				break;
		}
		logger.log(`Web Vitals Metric: ${metric.name}`, metric.value);
	};

	onFCP(handleMetric);
	onLCP(handleMetric);
	onCLS(handleMetric);
	onINP(handleMetric);
	onTTFB(handleMetric);

	setTimeout(() => {
		sendVitals();
	}, 4000);

	const report = () => {
		sendVitals();
	};

	let reportTimeout: number | undefined;
	const debouncedReport = (immediate = false) => {
		if (reportTimeout) {
			window.clearTimeout(reportTimeout);
		}
		if (immediate) {
			report();
		} else {
			reportTimeout = window.setTimeout(report, 1000);
		}
	};

	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			debouncedReport(true);
		}
	});

	window.addEventListener("pagehide", () => debouncedReport(true));
}

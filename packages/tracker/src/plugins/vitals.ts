import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import type { BaseTracker } from "../core/tracker";
import type { WebVitalMetricName } from "../core/types";
import { logger } from "../core/utils";

type FPSMetric = {
	name: "FPS";
	value: number;
};

const PER_ROUTE_METRICS: WebVitalMetricName[] = ["CLS", "INP", "FPS"];

let activeFPSMeasurement: { cancelled: boolean } | null = null;

const onFPS = (callback: (metric: FPSMetric) => void) => {
	if (typeof window === "undefined") {
		return;
	}

	if (activeFPSMeasurement) {
		activeFPSMeasurement.cancelled = true;
	}

	const measurement = { cancelled: false };
	activeFPSMeasurement = measurement;

	let frames = 0;
	const start = performance.now();
	const duration = 2000;

	const countFrame = () => {
		if (measurement.cancelled) {
			return;
		}
		frames += 1;
		if (performance.now() - start < duration) {
			requestAnimationFrame(countFrame);
		} else {
			activeFPSMeasurement = null;
			callback({ name: "FPS", value: Math.round((frames / duration) * 1000) });
		}
	};

	if (document.readyState === "complete") {
		requestAnimationFrame(countFrame);
	} else {
		window.addEventListener("load", () => requestAnimationFrame(countFrame), { once: true });
	}
};

export function initWebVitalsTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	const sentMetrics = new Set<WebVitalMetricName>();

	const handleMetric = (metric: Metric | FPSMetric) => {
		const name = metric.name as WebVitalMetricName;
		if (sentMetrics.has(name)) {
			return;
		}
		sentMetrics.add(name);

		const value = name === "CLS" ? metric.value : Math.round(metric.value);
		logger.log(`Web Vital captured: ${name}`, value);

		tracker.sendVital({
			timestamp: Date.now(),
			path: window.location.pathname,
			metricName: name,
			metricValue: value,
			anonymousId: tracker.anonymousId,
			sessionId: tracker.sessionId,
		});
	};

	onFCP(handleMetric);
	onLCP(handleMetric);
	onTTFB(handleMetric);

	onCLS(handleMetric);
	onINP(handleMetric);
	onFPS(handleMetric);

	tracker.onRouteChange(() => {
		tracker.flushVitals();

		for (const metric of PER_ROUTE_METRICS) {
			sentMetrics.delete(metric);
		}

		onFPS(handleMetric);

		logger.log("Vitals reset for new route, per-route metrics cleared");
	});
}

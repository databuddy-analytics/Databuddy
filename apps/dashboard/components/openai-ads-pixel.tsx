"use client";

import { useEffect } from "react";

const PIXEL_ID = process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID?.trim();
const SCRIPT_SRC = "https://bzrcdn.openai.com/sdk/oaiq.min.js";

type OpenAiAdsQueue = ((...args: unknown[]) => void) & {
	q?: unknown[][];
};

declare global {
	interface Window {
		oaiq?: OpenAiAdsQueue;
	}
}

let initializedPixelId: string | null = null;

function createOpenAiQueue(): OpenAiAdsQueue {
	const queuedCalls: unknown[][] = [];
	return Object.assign(
		(...args: unknown[]) => {
			queuedCalls.push(args);
		},
		{ q: queuedCalls }
	);
}

function initOpenAiQueue(): boolean {
	if (typeof window === "undefined" || !PIXEL_ID) {
		return false;
	}

	if (!window.oaiq) {
		window.oaiq = createOpenAiQueue();

		const script = document.createElement("script");
		script.async = true;
		script.src = SCRIPT_SRC;
		document.head.insertBefore(script, document.head.firstChild);
	}

	if (initializedPixelId !== PIXEL_ID) {
		window.oaiq("init", { pixelId: PIXEL_ID });
		initializedPixelId = PIXEL_ID;
	}

	return true;
}

export function OpenAiAdsPixel() {
	useEffect(() => {
		initOpenAiQueue();
	}, []);

	return null;
}

export function measureOpenAiRegistrationCompleted() {
	if (!initOpenAiQueue()) {
		return;
	}

	window.oaiq?.("measure", "registration_completed", {
		type: "customer_action",
	});
}

"use client";

import { useEffect } from "react";

const PIXEL_ID = process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID?.trim();
const SCRIPT_SRC = "https://bzrcdn.openai.com/sdk/oaiq.min.js";

interface OpenAiAdsQueue {
	q?: IArguments[];
	(...args: unknown[]): void;
}

declare global {
	interface Window {
		oaiq?: OpenAiAdsQueue;
	}
}

function initOpenAiQueue() {
	if (typeof window === "undefined" || !PIXEL_ID) {
		return;
	}

	if (!window.oaiq) {
		const queue = function () {
			// biome-ignore lint/complexity/noArguments: Match OpenAI's pixel bootstrap queue shape.
			queue.q?.push(arguments);
		} as OpenAiAdsQueue;
		queue.q = [];
		window.oaiq = queue;

		const script = document.createElement("script");
		script.async = true;
		script.src = SCRIPT_SRC;
		document.head.insertBefore(script, document.head.firstChild);
	}

	window.oaiq("init", { pixelId: PIXEL_ID });
}

export function OpenAiAdsPixel() {
	useEffect(() => {
		initOpenAiQueue();
	}, []);

	return null;
}

export function measureOpenAiRegistrationCompleted() {
	if (!(PIXEL_ID && typeof window !== "undefined")) {
		return;
	}

	initOpenAiQueue();
	window.oaiq?.("measure", "registration_completed", {
		type: "customer_action",
	});
}

"use client";

import { useEffect } from "react";
import { publicConfig } from "@databuddy/env/public";

const PIXEL_ID = publicConfig.integrations.openAiAdsPixelId;
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

export function isOpenAiAdsPixelHostAllowed(hostname: string): boolean {
	return !["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(
		hostname.toLowerCase()
	);
}

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
	if (
		typeof window === "undefined" ||
		!PIXEL_ID ||
		!isOpenAiAdsPixelHostAllowed(window.location.hostname)
	) {
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

function createRegistrationEventId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `registration_completed_${Date.now()}_${Math.random()
		.toString(36)
		.slice(2)}`;
}

export function buildOpenAiRegistrationMeasureArgs(
	eventId?: string
): unknown[] {
	return [
		"measure",
		"registration_completed",
		{ type: "customer_action" },
		...(eventId ? [{ event_id: eventId }] : []),
	];
}

export function OpenAiAdsPixel() {
	useEffect(() => {
		initOpenAiQueue();
	}, []);

	return null;
}

export function measureOpenAiRegistrationCompleted(eventId?: string) {
	if (!initOpenAiQueue()) {
		return;
	}

	window.oaiq?.(...buildOpenAiRegistrationMeasureArgs(eventId));
}

export function trackOpenAiRegistrationCompleted() {
	measureOpenAiRegistrationCompleted(createRegistrationEventId());
}

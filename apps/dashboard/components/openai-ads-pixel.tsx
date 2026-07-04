"use client";

import { useEffect } from "react";
import { publicConfig } from "@databuddy/env/public";
import type { SignupEventProperties } from "@databuddy/shared/custom-events";

const PIXEL_ID = publicConfig.integrations.openAiAdsPixelId;
const SCRIPT_SRC = "https://bzrcdn.openai.com/sdk/oaiq.min.js";

interface RegistrationConversionInput {
	email?: string;
	eventId?: string;
	properties?: SignupEventProperties;
	sourceUrl?: string;
}

interface RegistrationConversionPayload {
	email?: string;
	eventId: string;
	oppref?: string;
	sourceUrl: string;
}

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

export function buildOpenAiRegistrationConversionPayload(
	input: RegistrationConversionInput
): RegistrationConversionPayload {
	return {
		...(input.email ? { email: input.email } : {}),
		eventId: input.eventId ?? createRegistrationEventId(),
		...(input.properties?.oppref ? { oppref: input.properties.oppref } : {}),
		sourceUrl: input.sourceUrl ?? window.location.href,
	};
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

export function sendOpenAiRegistrationCompletedConversion(
	payload: RegistrationConversionPayload
) {
	if (
		typeof window === "undefined" ||
		!PIXEL_ID ||
		!isOpenAiAdsPixelHostAllowed(window.location.hostname)
	) {
		return;
	}

	fetch("/api/openai-ads/conversions", {
		body: JSON.stringify(payload),
		headers: { "Content-Type": "application/json" },
		keepalive: true,
		method: "POST",
	}).catch(() => {
		// Signup should not depend on ad-platform reporting.
	});
}

export function trackOpenAiRegistrationCompleted(
	input: RegistrationConversionInput = {}
) {
	const payload = buildOpenAiRegistrationConversionPayload(input);
	measureOpenAiRegistrationCompleted(payload.eventId);
	sendOpenAiRegistrationCompletedConversion(payload);
}

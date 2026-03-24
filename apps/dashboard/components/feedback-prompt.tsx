"use client";

import { ChatTextIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "databuddy-feedback-prompt";

const DAY = 1000 * 60 * 60 * 24;
const GRACE_PERIOD = DAY;
const COOLDOWN_DEFAULT = DAY * 7;
const COOLDOWN_ENGAGED = DAY * 4;
const SHOW_DELAY_MS = process.env.NODE_ENV === "development" ? 3000 : 45_000;

const PROMPTS = [
	{
		heading: "How's your experience?",
		body: "Share feedback and earn credits toward your plan.",
	},
	{
		heading: "Got a suggestion?",
		body: "Submit feedback and get rewarded when it's approved.",
	},
	{
		heading: "Spotted something?",
		body: "Help us improve — your feedback earns you credits.",
	},
	{
		heading: "Enjoying Databuddy?",
		body: "We'd love to hear from you. Feedback earns credits.",
	},
] as const;

interface PromptState {
	firstSeenAt: number;
	lastDismissedAt: number;
	dismissCount: number;
	hasSubmittedFeedback: boolean;
}

function readState(): PromptState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			return JSON.parse(raw) as PromptState;
		}
	} catch {
		// corrupted — fall through to create initial
	}

	const initial: PromptState = {
		firstSeenAt: Date.now(),
		lastDismissedAt: 0,
		dismissCount: 0,
		hasSubmittedFeedback: false,
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
	return initial;
}

function writeState(patch: Partial<PromptState>) {
	const current = readState();
	localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}

export function markFeedbackSubmitted() {
	writeState({ hasSubmittedFeedback: true });
}

function isEligible(state: PromptState, pathname: string): boolean {
	if (pathname.startsWith("/feedback")) return false;

	const now = Date.now();

	if (now - state.firstSeenAt < GRACE_PERIOD) return false;

	if (state.lastDismissedAt > 0) {
		const cooldown = state.hasSubmittedFeedback
			? COOLDOWN_ENGAGED
			: COOLDOWN_DEFAULT;
		if (now - state.lastDismissedAt < cooldown) return false;
	}

	return true;
}

export function FeedbackPrompt() {
	const pathname = usePathname();
	const [visible, setVisible] = useState(false);
	const stateRef = useRef<PromptState | null>(null);

	useEffect(() => {
		const state = readState();
		stateRef.current = state;

		if (!isEligible(state, pathname)) return;

		const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
		return () => clearTimeout(timer);
	}, [pathname]);

	const handleDismissAction = useCallback(() => {
		setVisible(false);
		writeState({
			lastDismissedAt: Date.now(),
			dismissCount: (stateRef.current?.dismissCount ?? 0) + 1,
		});
	}, []);

	if (!visible) return null;

	const prompt =
		PROMPTS[(stateRef.current?.dismissCount ?? 0) % PROMPTS.length];

	return (
		<div className="fixed right-4 bottom-4 z-50 w-72 rounded border bg-card p-4 shadow-lg">
			<div className="mb-3 flex items-start justify-between gap-2">
				<div className="flex size-8 shrink-0 items-center justify-center rounded border bg-secondary">
					<ChatTextIcon
						className="text-accent-foreground"
						size={14}
						weight="duotone"
					/>
				</div>
				<button
					aria-label="Dismiss feedback prompt"
					className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
					onClick={handleDismissAction}
					type="button"
				>
					<XIcon size={14} />
				</button>
			</div>
			<p className="mb-1 text-balance font-medium text-sm">{prompt.heading}</p>
			<p className="mb-3 text-pretty text-muted-foreground text-xs leading-relaxed">
				{prompt.body}
			</p>
			<Button
				asChild
				className="w-full"
				onClick={handleDismissAction}
				size="sm"
				variant="secondary"
			>
				<Link href="/feedback">Give Feedback</Link>
			</Button>
		</div>
	);
}

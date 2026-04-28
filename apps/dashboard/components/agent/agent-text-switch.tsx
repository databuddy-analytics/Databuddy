"use client";

import { AnimatePresence, motion } from "motion/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type RefObject,
} from "react";
import { cn } from "@/lib/utils";

const SPRING = {
	type: "spring",
	stiffness: 500,
	damping: 35,
} as const;

const SPRING_NO_STAGGER = {
	type: "spring",
	stiffness: 250,
	damping: 35,
} as const;

const TARGET = {
	rotateX: 80,
	y: -6,
	filter: "blur(4px)",
} as const;

interface AgentTextSwitchProps {
	active: boolean;
	className?: string;
	holdMs?: number;
	nostagger?: boolean;
	phrases: readonly string[];
}

function topLayerDelay(
	stagger: boolean,
	flip: boolean,
	index: number,
	length: number
): number {
	if (!stagger) {
		return 0;
	}
	if (flip) {
		return index * 0.05;
	}
	return (length - 1 - index) * 0.06;
}

function bottomLayerDelay(
	stagger: boolean,
	flip: boolean,
	index: number,
	length: number
): number {
	if (!stagger) {
		return 0;
	}
	if (flip) {
		return 0.1 + index * 0.05;
	}
	return (length - 1 - index) * 0.05;
}

function useInView(rootRef: RefObject<HTMLElement | null>): boolean {
	const [inView, setInView] = useState(true);
	useEffect(() => {
		const el = rootRef.current;
		if (!el) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry) {
					setInView(entry.isIntersecting);
				}
			},
			{ rootMargin: "0px", threshold: 0.08 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [rootRef]);
	return inView;
}

function DualStaggerStack({
	flip,
	lineBottom,
	lineTop,
	onBothLayersCompleteAction,
	stagger,
}: {
	flip: boolean;
	lineBottom: string;
	lineTop: string;
	onBothLayersCompleteAction: () => void;
	stagger: boolean;
}) {
	const topChunks = lineTop.split("");
	const bottomChunks = lineBottom.split("");
	const topLast = topChunks.length - 1;
	const bottomLast = bottomChunks.length - 1;

	const layerDoneRef = useRef({ bottom: false, top: false });
	const previousFlipRef = useRef(false);

	if (flip && !previousFlipRef.current) {
		layerDoneRef.current = { bottom: false, top: false };
	}
	previousFlipRef.current = flip;

	const spring = stagger ? SPRING : SPRING_NO_STAGGER;

	const tryFinish = useCallback(() => {
		const d = layerDoneRef.current;
		if (d.top && d.bottom) {
			layerDoneRef.current = { bottom: false, top: false };
			onBothLayersCompleteAction();
		}
	}, [onBothLayersCompleteAction]);

	const markTopDone = useCallback(() => {
		if (layerDoneRef.current.top) {
			return;
		}
		layerDoneRef.current.top = true;
		tryFinish();
	}, [tryFinish]);

	const markBottomDone = useCallback(() => {
		if (layerDoneRef.current.bottom) {
			return;
		}
		layerDoneRef.current.bottom = true;
		tryFinish();
	}, [tryFinish]);

	return (
		<span
			aria-hidden
			className="inline-grid place-self-start [perspective:880px] [&>*]:col-start-1 [&>*]:row-start-1"
			style={{ transformStyle: "preserve-3d" }}
		>
			<span className="inline-block min-w-0">
				<AnimatePresence initial={false}>
					{topChunks.map((letter, index) => (
						<motion.span
							animate={{
								filter: flip ? TARGET.filter : "blur(0px)",
								opacity: flip ? 0 : 1,
								rotateX: flip ? TARGET.rotateX : 0,
								y: flip ? TARGET.y : 0,
							}}
							className="inline-block"
							initial={false}
							key={`top-${lineTop}-${index}`}
							onAnimationComplete={() => {
								if (flip && index === topLast) {
									markTopDone();
								}
							}}
							style={letter === " " ? { display: "inline" } : undefined}
							transition={{
								delay: topLayerDelay(stagger, flip, index, topChunks.length),
								...spring,
							}}
						>
							{letter}
						</motion.span>
					))}
				</AnimatePresence>
			</span>
			<span className="inline-block min-w-0">
				<AnimatePresence initial={false}>
					{bottomChunks.map((letter, index) => (
						<motion.span
							animate={{
								filter: flip ? "blur(0px)" : TARGET.filter,
								opacity: flip ? 1 : 0,
								rotateX: flip ? 360 : 270,
								y: flip ? 0 : TARGET.y * -1,
							}}
							className="inline-block"
							initial={false}
							key={`bottom-${lineBottom}-${index}`}
							onAnimationComplete={() => {
								if (flip && index === bottomLast) {
									markBottomDone();
								}
							}}
							style={letter === " " ? { display: "inline" } : undefined}
							transition={{
								delay: bottomLayerDelay(
									stagger,
									flip,
									index,
									bottomChunks.length
								),
								...spring,
							}}
						>
							{letter}
						</motion.span>
					))}
				</AnimatePresence>
			</span>
		</span>
	);
}

export function AgentTextSwitch({
	active,
	className,
	holdMs = 4800,
	nostagger = false,
	phrases,
}: AgentTextSwitchProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined
	);
	const inView = useInView(rootRef);

	const [phraseIndex, setPhraseIndex] = useState(0);
	const [flip, setFlip] = useState(false);

	const clearHold = useCallback(() => {
		if (holdTimerRef.current !== undefined) {
			clearTimeout(holdTimerRef.current);
			holdTimerRef.current = undefined;
		}
	}, []);

	const onBothLayersCompleteAction = useCallback(() => {
		setPhraseIndex((i) => (i + 1) % phrases.length);
		setFlip(false);
	}, [phrases.length]);

	const scheduleHold = useCallback(() => {
		clearHold();
		if (!(active && inView)) {
			return;
		}
		if (phrases.length < 2) {
			return;
		}
		holdTimerRef.current = setTimeout(() => {
			setFlip((isFlipping) => (isFlipping ? isFlipping : true));
		}, holdMs);
	}, [active, inView, holdMs, clearHold, phrases.length]);

	useEffect(() => {
		if (!active) {
			clearHold();
			setFlip(false);
			setPhraseIndex(0);
		}
	}, [active, clearHold]);

	useEffect(() => {
		if (!(active && inView)) {
			clearHold();
			return;
		}
		if (flip) {
			clearHold();
		} else {
			scheduleHold();
		}
		return clearHold;
	}, [active, inView, flip, scheduleHold, clearHold]);

	const lineTop = phrases[phraseIndex] ?? "";
	const lineBottom = phrases[(phraseIndex + 1) % phrases.length] ?? "";
	const liveLine = lineTop;

	if (!active) {
		return null;
	}

	if (phrases.length === 0) {
		return null;
	}

	if (phrases.length === 1) {
		const only = phrases[0] ?? "";
		return (
			<div className="w-fit min-w-0 max-w-full" ref={rootRef}>
				<p aria-hidden className={cn("text-balance text-pretty", className)}>
					{only}
				</p>
				<span aria-live="polite" className="sr-only">
					{only}
				</span>
			</div>
		);
	}

	return (
		<div className="w-fit min-w-0 max-w-full" ref={rootRef}>
			<p aria-hidden className={cn("text-balance text-pretty", className)}>
				<DualStaggerStack
					flip={flip}
					key={phraseIndex}
					lineBottom={lineBottom}
					lineTop={lineTop}
					onBothLayersCompleteAction={onBothLayersCompleteAction}
					stagger={!nostagger}
				/>
			</p>
			<span aria-live="polite" className="sr-only">
				{liveLine}
			</span>
		</div>
	);
}

export const AGENT_INPUT_PLACEHOLDER_PHRASES = [
	"Ask Databunny anything about your analytics…",
	"Type / for quick commands and prompts...",
] as const;

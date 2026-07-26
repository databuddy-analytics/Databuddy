"use client";

import { Button, Tooltip } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";
import { MicrophoneIcon } from "@databuddy/ui/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import FluidOrb from "@/components/ui/fluid-orb";
import { cn } from "@/lib/utils";
import { useMicLevel } from "./hooks/use-mic-level";
import { useSpeechTranscription } from "./hooks/use-speech-transcription";

interface AgentVoiceDialogProps {
	onTranscript: (transcript: string) => void;
}

const ORB_COLORS = ["#E3A514", "#B74677", "#453C7C"];

export function AgentVoiceDialog({ onTranscript }: AgentVoiceDialogProps) {
	const [open, setOpen] = useState(false);
	const [orbColor, setOrbColor] = useState(ORB_COLORS[0]);
	const {
		displayTranscript,
		error,
		finalTranscript,
		interimTranscript,
		isSupported,
		start,
		status,
		stop,
	} = useSpeechTranscription();
	const hasTranscript = displayTranscript.trim().length > 0;
	const reduceMotion = useReducedMotion();
	const orbRef = useRef<HTMLDivElement | null>(null);
	const orbScaleRef = useRef(1);
	const transcriptRef = useRef<HTMLParagraphElement | null>(null);

	useMicLevel(
		open && status !== "error",
		useCallback((level: number) => {
			const target = 1 + Math.min(level * 0.9, 0.06);
			orbScaleRef.current += (target - orbScaleRef.current) * 0.06;
			orbRef.current?.style.setProperty(
				"transform",
				`scale(${orbScaleRef.current.toFixed(4)})`
			);
		}, [])
	);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);
			if (nextOpen) {
				orbScaleRef.current = 1;
				setOrbColor(ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)]);
				start();
			} else {
				stop();
			}
		},
		[start, stop]
	);

	const handleDone = useCallback(() => {
		const nextTranscript = displayTranscript.trim();
		if (!nextTranscript) {
			return;
		}

		onTranscript(nextTranscript);
		handleOpenChange(false);
	}, [displayTranscript, handleOpenChange, onTranscript]);

	const handleTranscriptKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			handleDone();
		}
	});

	useEffect(() => {
		if (!(open && hasTranscript)) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => handleTranscriptKeyDown(event);
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, hasTranscript]);

	useEffect(() => {
		transcriptRef.current?.scrollTo({
			top: transcriptRef.current.scrollHeight,
		});
	}, [displayTranscript]);

	if (!isSupported) {
		return null;
	}

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<Tooltip content="Voice input" side="top">
				<Dialog.Trigger
					render={
						<Button
							aria-label="Open voice input"
							className="size-7 transition-transform active:scale-[0.97]"
							size="icon"
							type="button"
							variant="secondary"
						>
							<MicrophoneIcon className="size-3.5" />
						</Button>
					}
				/>
			</Tooltip>

			<Dialog.Content className="max-w-sm shadow-none">
				<Dialog.Close />
				<Dialog.Header className="border-border/50 border-b text-center">
					<Dialog.Title className="text-sm">Voice input</Dialog.Title>
				</Dialog.Header>

				<Dialog.Body className="flex flex-col items-center gap-5 py-8">
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="grid size-56 place-items-center"
						initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
					>
						<div
							className={cn(
								"transition-[opacity,filter] duration-300 will-change-transform",
								status === "error" && "opacity-40 saturate-50"
							)}
							ref={orbRef}
						>
							<motion.div
								animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.015, 1] }}
								transition={{
									duration: 4,
									ease: "easeInOut",
									repeat: Number.POSITIVE_INFINITY,
								}}
							>
								<FluidOrb aria-hidden="true" color={orbColor} size={208} />
							</motion.div>
						</div>
					</motion.div>

					<div
						aria-live="polite"
						className="flex min-h-20 w-full items-center justify-center px-2 text-center"
					>
						<AnimatePresence initial={false} mode="wait">
							{hasTranscript ? (
								<motion.p
									animate={{ opacity: 1 }}
									className="max-h-24 w-full overflow-y-auto text-balance text-foreground text-sm leading-6"
									exit={{ opacity: 0 }}
									initial={{ opacity: 0 }}
									key="transcript"
									ref={transcriptRef}
									transition={{
										duration: reduceMotion ? 0 : 0.15,
										ease: "easeOut",
									}}
								>
									{finalTranscript}
									{interimTranscript ? (
										<span className="text-muted-foreground">
											{finalTranscript ? " " : ""}
											{interimTranscript}
										</span>
									) : null}
								</motion.p>
							) : (
								<motion.div
									animate={{ opacity: 1 }}
									className="flex flex-col items-center gap-2"
									exit={{ opacity: 0 }}
									initial={{ opacity: 0 }}
									key="status"
									transition={{
										duration: reduceMotion ? 0 : 0.15,
										ease: "easeOut",
									}}
								>
									{status === "error" ? (
										<span className="font-medium text-foreground text-sm tracking-tight">
											Voice unavailable
										</span>
									) : (
										<Shimmer
											as="span"
											className="font-medium text-sm tracking-tight"
										>
											Listening…
										</Shimmer>
									)}
									<span className="max-w-60 text-balance text-muted-foreground text-xs leading-5">
										{error ??
											(isSupported
												? "Start speaking when you're ready"
												: "Voice input is not supported in this browser")}
									</span>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</Dialog.Body>

				<AnimatePresence initial={false}>
					{hasTranscript ? (
						<motion.div
							animate={{ opacity: 1 }}
							className="overflow-hidden"
							exit={{ opacity: 0 }}
							initial={reduceMotion ? false : { opacity: 0 }}
							key="footer"
							layout
							transition={{
								duration: reduceMotion ? 0 : 0.2,
								ease: "easeOut",
							}}
						>
							<Dialog.Footer className="border-border/50 border-t">
								<Button onClick={handleDone}>
									Done
									<kbd className="ml-1.5 rounded border border-current/30 px-1 font-mono text-[10px] leading-4">
										↵
									</kbd>
								</Button>
							</Dialog.Footer>
						</motion.div>
					) : null}
				</AnimatePresence>
			</Dialog.Content>
		</Dialog>
	);
}

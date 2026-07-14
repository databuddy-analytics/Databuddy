"use client";

import { Button } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";
import { MicrophoneIcon } from "@databuddy/ui/icons";
import { useCallback, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import FluidOrb from "@/components/ui/fluid-orb";
import { useSpeechTranscription } from "./hooks/use-speech-transcription";

interface AgentVoiceDialogProps {
	onTranscript: (transcript: string) => void;
}

export function AgentVoiceDialog({ onTranscript }: AgentVoiceDialogProps) {
	const [open, setOpen] = useState(false);
	const { displayTranscript, error, isSupported, start, status, stop } =
		useSpeechTranscription();
	const hasTranscript = displayTranscript.trim().length > 0;

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);
			if (nextOpen) {
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

	if (!isSupported) {
		return null;
	}

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<Dialog.Trigger
				render={
					<Button
						aria-label="Open voice input"
						className="size-7"
						size="icon"
						type="button"
						variant="secondary"
					>
						<MicrophoneIcon className="size-3.5" />
					</Button>
				}
			/>

			<Dialog.Content className="max-w-sm shadow-none">
				<Dialog.Close />
				<Dialog.Header className="border-border/50 border-b text-center">
					<Dialog.Title className="text-sm">Voice input</Dialog.Title>
				</Dialog.Header>

				<Dialog.Body className="flex flex-col items-center gap-5 py-8">
					<div className="grid size-56 place-items-center">
						<FluidOrb aria-hidden="true" size={208} />
					</div>

					<div
						aria-live="polite"
						className="flex min-h-20 w-full items-center justify-center px-2 text-center"
					>
						{hasTranscript ? (
							<p className="fade-in animate-in text-balance text-foreground text-sm leading-6 duration-150 motion-reduce:animate-none">
								{displayTranscript}
							</p>
						) : (
							<div className="flex flex-col items-center gap-2">
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
							</div>
						)}
					</div>
				</Dialog.Body>

				{hasTranscript ? (
					<Dialog.Footer className="border-border/50 border-t">
						<Button
							className="fade-in animate-in duration-150 motion-reduce:animate-none"
							onClick={handleDone}
						>
							Done
						</Button>
					</Dialog.Footer>
				) : null}
			</Dialog.Content>
		</Dialog>
	);
}

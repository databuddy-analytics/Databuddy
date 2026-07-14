"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternative {
	transcript: string;
}

interface SpeechRecognitionResult {
	isFinal: boolean;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEvent extends Event {
	resultIndex: number;
	results: {
		[index: number]: SpeechRecognitionResult;
		length: number;
	};
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
}

interface SpeechRecognition {
	abort: () => void;
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onend: (() => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	start: () => void;
	stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognitionWindow = Window & {
	SpeechRecognition?: SpeechRecognitionConstructor;
	webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type TranscriptionStatus = "idle" | "listening" | "speaking" | "error";

function getSpeechRecognitionConstructor() {
	if (typeof window === "undefined") {
		return;
	}

	const speechWindow = window as SpeechRecognitionWindow;
	return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function joinTranscript(...parts: string[]) {
	return parts
		.map((part) => part.trim())
		.filter(Boolean)
		.join(" ");
}

export function useSpeechTranscription() {
	const recognitionRef = useRef<SpeechRecognition | null>(null);
	const shouldListenRef = useRef(false);
	const finalTranscriptRef = useRef("");
	const [transcript, setTranscript] = useState("");
	const [interimTranscript, setInterimTranscript] = useState("");
	const [status, setStatus] = useState<TranscriptionStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const isSupported = Boolean(getSpeechRecognitionConstructor());

	const reset = useCallback(() => {
		finalTranscriptRef.current = "";
		setTranscript("");
		setInterimTranscript("");
		setError(null);
	}, []);

	const stop = useCallback(() => {
		shouldListenRef.current = false;
		recognitionRef.current?.stop();
		setStatus("idle");
	}, []);

	const start = useCallback(() => {
		const Recognition = getSpeechRecognitionConstructor();
		reset();

		if (!Recognition) {
			setError("Voice input is not supported in this browser.");
			setStatus("error");
			return;
		}

		const recognition = new Recognition();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = navigator.language || "en-US";
		recognitionRef.current = recognition;
		shouldListenRef.current = true;

		recognition.onresult = (event) => {
			const finalParts: string[] = [];
			const interimParts: string[] = [];

			for (
				let index = event.resultIndex;
				index < event.results.length;
				index++
			) {
				const result = event.results[index];
				const resultTranscript = result?.[0]?.transcript ?? "";
				if (result?.isFinal) {
					finalParts.push(resultTranscript);
				} else {
					interimParts.push(resultTranscript);
				}
			}

			if (finalParts.length > 0) {
				finalTranscriptRef.current = joinTranscript(
					finalTranscriptRef.current,
					...finalParts
				);
				setTranscript(finalTranscriptRef.current);
			}

			const nextInterimTranscript = joinTranscript(...interimParts);
			setInterimTranscript(nextInterimTranscript);
			setStatus(
				finalTranscriptRef.current || nextInterimTranscript
					? "speaking"
					: "listening"
			);
		};

		recognition.onerror = (event) => {
			if (event.error === "aborted") {
				return;
			}

			if (event.error === "no-speech") {
				setStatus("listening");
				return;
			}

			shouldListenRef.current = false;
			setError(
				event.error === "not-allowed" || event.error === "service-not-allowed"
					? "Allow microphone access to use voice input."
					: "Voice input stopped unexpectedly. Please try again."
			);
			setStatus("error");
		};

		recognition.onend = () => {
			if (!shouldListenRef.current) {
				return;
			}

			try {
				recognition.start();
			} catch {
				shouldListenRef.current = false;
				setError("Voice input stopped unexpectedly. Please try again.");
				setStatus("error");
			}
		};

		try {
			recognition.start();
			setStatus("listening");
		} catch {
			shouldListenRef.current = false;
			setError("Voice input could not start. Please try again.");
			setStatus("error");
		}
	}, [reset]);

	useEffect(
		() => () => {
			shouldListenRef.current = false;
			recognitionRef.current?.abort();
		},
		[]
	);

	return {
		displayTranscript: joinTranscript(transcript, interimTranscript),
		error,
		isSupported,
		start,
		status,
		stop,
	};
}

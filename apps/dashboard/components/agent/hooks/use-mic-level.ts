"use client";

import { useEffect, useRef } from "react";

export function useMicLevel(active: boolean, onLevel: (level: number) => void) {
	const onLevelRef = useRef(onLevel);

	useEffect(() => {
		onLevelRef.current = onLevel;
	}, [onLevel]);

	useEffect(() => {
		if (!active) {
			return;
		}
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return;
		}

		let frame = 0;
		let stream: MediaStream | null = null;
		let audioContext: AudioContext | null = null;
		let cancelled = false;

		const setup = async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			} catch {
				return;
			}
			if (cancelled) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				return;
			}

			audioContext = new AudioContext();
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			audioContext.createMediaStreamSource(stream).connect(analyser);
			const samples = new Uint8Array(analyser.frequencyBinCount);

			const tick = () => {
				analyser.getByteTimeDomainData(samples);
				let sumOfSquares = 0;
				for (const sample of samples) {
					const normalized = (sample - 128) / 128;
					sumOfSquares += normalized * normalized;
				}
				onLevelRef.current(Math.sqrt(sumOfSquares / samples.length));
				frame = requestAnimationFrame(tick);
			};
			tick();
		};

		setup();

		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
			}
			audioContext?.close();
		};
	}, [active]);
}

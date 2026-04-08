"use client";

import { useState } from "react";

const THINKING_PHRASES = [
	"Thinking",
	"Hopping to it",
	"Sniffing through data",
	"Nibbling queries",
	"Digging up insights",
	"Twitching whiskers",
	"Burrowing into events",
	"Chasing carrots",
	"Crunching numbers",
	"Untangling threads",
	"Pondering",
	"Cooking",
	"Following the scent",
	"Rummaging",
] as const;

function pickRandomPhrase(): string {
	const idx = Math.floor(Math.random() * THINKING_PHRASES.length);
	return THINKING_PHRASES[idx] ?? "Thinking";
}

export function useThinkingPhrase(): string {
	const [phrase] = useState(pickRandomPhrase);
	return phrase;
}

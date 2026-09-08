"use client";

import {
	businessContextEditSchema,
	type BusinessContextEdit,
} from "@databuddy/shared/organization-business-context";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

// Keep invalid/unfinished input recoverable too; saving applies the real limits.
const recoverySchema = businessContextEditSchema.extend({
	content: z.string().max(100_000),
	teamContext: z
		.object({
			priority: z.string().max(10_000),
			successDefinition: z.string().max(10_000),
			exclusions: z.string().max(10_000),
		})
		.optional(),
});
const tabDrafts = new Map<
	string,
	{ draft: BusinessContextEdit | null; recoverable: boolean }
>();

export function useBusinessContextDraft(key: string, canEdit: boolean) {
	const [draft, setDraft] = useState<BusinessContextEdit | null>(null);
	const [ready, setReady] = useState(false);
	const [recoverable, setRecoverable] = useState(true);

	useEffect(() => {
		if (!canEdit) {
			tabDrafts.set(key, { draft: null, recoverable: true });
			try {
				sessionStorage.removeItem(key);
			} catch {
				/* Storage may be disabled. */
			}
			setDraft(null);
			setReady(true);
			return;
		}
		let entry = tabDrafts.get(key);
		if (!entry) {
			entry = { draft: null, recoverable: true };
			try {
				const raw = sessionStorage.getItem(key);
				if (raw) {
					const result = recoverySchema.safeParse(JSON.parse(raw));
					if (result.success) {
						entry.draft = result.data;
					}
				}
			} catch {
				entry.recoverable = false;
			}
			tabDrafts.set(key, entry);
		}
		// Memory is newer than storage after a failed write; null is a tombstone.
		setDraft(entry.draft);
		setRecoverable(entry.recoverable);
		setReady(true);
	}, [key, canEdit]);

	const updateDraft = useCallback(
		(next: BusinessContextEdit | null) => {
			setDraft(next);
			const entry = { draft: next, recoverable: true };
			tabDrafts.set(key, entry);
			try {
				if (next) {
					sessionStorage.setItem(key, JSON.stringify(next));
				} else {
					sessionStorage.removeItem(key);
				}
				setRecoverable(true);
			} catch {
				entry.recoverable = false;
				setRecoverable(false);
			}
		},
		[key]
	);

	const clearDraft = useCallback(
		(submitted: BusinessContextEdit | null) => {
			// A save may finish after unmount. Never erase a newer remounted draft.
			if ((tabDrafts.get(key)?.draft ?? null) === submitted) {
				updateDraft(null);
			}
		},
		[key, updateDraft]
	);

	useEffect(() => {
		if (!draft || recoverable) {
			return;
		}
		const protect = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", protect);
		return () => window.removeEventListener("beforeunload", protect);
	}, [draft, recoverable]);

	return { draft, updateDraft, clearDraft, ready, recoverable };
}

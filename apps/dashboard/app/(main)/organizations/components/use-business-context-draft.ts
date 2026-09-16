"use client";

import {
	businessContextEditSchema,
	businessMeasurementPlanSchema,
	type BusinessContextEdit,
} from "@databuddy/shared/organization-business-context";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

// Keep invalid/unfinished input recoverable too; saving applies the real limits.
const draftRecoverySchema = businessContextEditSchema.extend({
	content: z.string().max(100_000),
	measurementPlans: z
		.array(
			businessMeasurementPlanSchema.extend({
				name: z.string().max(1000),
				activationEvent: z.string().max(1000),
				returnEvent: z.string().max(1000),
				namespace: z.string().max(1000).optional(),
			})
		)
		.max(20)
		.optional(),
	teamContext: z
		.object({
			priority: z.string().max(10_000),
			successDefinition: z.string().max(10_000),
			exclusions: z.string().max(10_000),
		})
		.optional(),
});
const researchSchema = z.object({
	websiteId: z.string().optional(),
	// Preserve incomplete and invalid input; generation validates it later.
	sourceText: z.string().max(100_000),
});
type ResearchInput = z.infer<typeof researchSchema>;
const recoverySchema = z.object({
	draft: draftRecoverySchema.nullable(),
	research: researchSchema.optional(),
});
interface Recovery {
	draft: BusinessContextEdit | null;
	recoverable: boolean;
	research?: ResearchInput;
}
const tabDrafts = new Map<string, Recovery>();

export function useBusinessContextDraft(key: string, canEdit: boolean) {
	const [entry, setEntry] = useState<Recovery>({
		draft: null,
		recoverable: true,
	});
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (!canEdit) {
			const empty = { draft: null, recoverable: true };
			tabDrafts.set(key, empty);
			try {
				sessionStorage.removeItem(key);
			} catch {
				/* Storage may be disabled. */
			}
			setEntry(empty);
			setReady(true);
			return;
		}
		let current = tabDrafts.get(key);
		if (!current) {
			current = { draft: null, recoverable: true };
			try {
				const raw = sessionStorage.getItem(key);
				if (raw) {
					const stored = JSON.parse(raw);
					const result = recoverySchema.safeParse(stored);
					if (result.success) {
						current = { ...result.data, recoverable: true };
					}
				}
			} catch {
				current.recoverable = false;
			}
			tabDrafts.set(key, current);
		}
		// Memory is newer than storage after a failed write; null is a tombstone.
		setEntry(current);
		setReady(true);
	}, [key, canEdit]);

	const store = useCallback(
		(next: Omit<Recovery, "recoverable">) => {
			const current = { ...next, recoverable: true };
			tabDrafts.set(key, current);
			try {
				if (next.draft || next.research) {
					sessionStorage.setItem(key, JSON.stringify(next));
				} else {
					sessionStorage.removeItem(key);
				}
			} catch {
				current.recoverable = false;
			}
			setEntry(current);
		},
		[key]
	);

	const updateDraft = useCallback(
		(draft: BusinessContextEdit | null) => {
			store({ draft, research: tabDrafts.get(key)?.research });
		},
		[key, store]
	);
	const updateResearch = useCallback(
		(research: ResearchInput) => {
			store({ draft: tabDrafts.get(key)?.draft ?? null, research });
		},
		[key, store]
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
		if (!(entry.draft || entry.research) || entry.recoverable) {
			return;
		}
		const protect = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", protect);
		return () => window.removeEventListener("beforeunload", protect);
	}, [entry]);

	return { ...entry, updateDraft, updateResearch, clearDraft, ready };
}

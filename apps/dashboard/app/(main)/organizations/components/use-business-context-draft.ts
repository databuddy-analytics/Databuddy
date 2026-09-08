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
const tabDrafts = new Map<string, BusinessContextEdit>();

export function useBusinessContextDraft(key: string, canEdit: boolean) {
	const [draft, setDraft] = useState<BusinessContextEdit | null>(null);
	const [ready, setReady] = useState(false);
	const [recoverable, setRecoverable] = useState(true);

	useEffect(() => {
		if (!canEdit) {
			tabDrafts.delete(key);
			try {
				sessionStorage.removeItem(key);
			} catch {
				/* Storage may be disabled. */
			}
			setDraft(null);
			setReady(true);
			return;
		}
		let restored = tabDrafts.get(key) ?? null;
		try {
			const raw = sessionStorage.getItem(key);
			if (raw) {
				const result = recoverySchema.safeParse(JSON.parse(raw));
				if (result.success) {
					restored = result.data;
				}
			}
		} catch {
			setRecoverable(false);
		}
		setDraft(restored);
		setReady(true);
	}, [key, canEdit]);

	const updateDraft = useCallback(
		(next: BusinessContextEdit | null) => {
			setDraft(next);
			if (next) {
				tabDrafts.set(key, next);
			} else {
				tabDrafts.delete(key);
			}
			try {
				if (next) {
					sessionStorage.setItem(key, JSON.stringify(next));
				} else {
					sessionStorage.removeItem(key);
				}
				setRecoverable(true);
			} catch {
				setRecoverable(false);
			}
		},
		[key]
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

	return { draft, updateDraft, ready, recoverable };
}

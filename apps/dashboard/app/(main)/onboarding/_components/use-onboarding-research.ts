"use client";

import type {
	BusinessBrief,
	BusinessContextSettings,
	BusinessTeamContext,
} from "@databuddy/shared/organization-business-context";
import { businessContextIsGenerating } from "@databuddy/shared/organization-business-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { orpc } from "@/lib/orpc";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";

export type OnboardingResearchPhase =
	| "idle"
	| "unavailable"
	| "reading"
	| "writing"
	| "ready"
	| "failed";

export type OnboardingResearchQuestion = NonNullable<
	BusinessBrief["followUpQuestions"]
>[number];

export interface OnboardingResearch {
	canStart: boolean;
	content: string;
	domain: string | null;
	message: string | null;
	pagesFailed: number;
	pagesRead: number;
	phase: OnboardingResearchPhase;
	questions: OnboardingResearchQuestion[];
	sources: BusinessBrief["sources"];
}

export const EMPTY_RESEARCH: OnboardingResearch = {
	canStart: false,
	content: "",
	domain: null,
	message: null,
	pagesFailed: 0,
	pagesRead: 0,
	phase: "idle",
	questions: [],
	sources: [],
};

interface ResearchWebsite {
	domain: string;
	id: string;
}

function countPages(settings: BusinessContextSettings | undefined) {
	const pages =
		settings?.generation?.research?.pages ??
		settings?.profile?.research?.pages ??
		[];
	const pagesRead = pages.filter((page) => page.status === "read").length;
	return { pagesRead, pagesFailed: pages.length - pagesRead };
}

function deriveResearch(input: {
	accessMessage: string | null;
	accessPending: boolean;
	accessStatus: string | null;
	settings: BusinessContextSettings | undefined;
	startError: string | null;
	website: ResearchWebsite | null;
}): OnboardingResearch {
	const { settings, website } = input;
	if (!website) {
		return EMPTY_RESEARCH;
	}
	const base = {
		...EMPTY_RESEARCH,
		domain: website.domain,
		...countPages(settings),
	};
	const generation = settings?.generation ?? null;
	if (generation && settings && businessContextIsGenerating(settings)) {
		return {
			...base,
			phase: generation.progress?.stage === "writing" ? "writing" : "reading",
			content: generation.progress?.content ?? "",
		};
	}
	if (generation?.status === "ready" && generation.draft) {
		return {
			...base,
			phase: "ready",
			content: generation.draft.content,
			questions: generation.draft.followUpQuestions ?? [],
			sources: generation.draft.sources,
		};
	}
	if (input.startError || generation?.status === "failed") {
		return {
			...base,
			phase: "failed",
			message:
				input.startError ??
				generation?.error ??
				"Databunny couldn't finish reading the site.",
			canStart: input.accessStatus === "allowed",
		};
	}
	if (settings?.profile) {
		return {
			...base,
			phase: "ready",
			content: settings.profile.content,
			questions: settings.profile.followUpQuestions ?? [],
			sources: settings.profile.sources,
		};
	}
	if (input.accessPending || !settings) {
		return base;
	}
	if (input.accessStatus !== "allowed") {
		return { ...base, phase: "unavailable", message: input.accessMessage };
	}
	return { ...base, canStart: true };
}

export function useOnboardingResearch(
	organizationId: string | undefined,
	website: ResearchWebsite | null
) {
	const queryClient = useQueryClient();
	const scope =
		organizationId && website
			? { organizationId, websiteId: website.id }
			: null;
	const settingsKey = orpc.businessContext.get.queryKey({
		input: { organizationId: organizationId ?? "" },
	});
	const stream = useRef<AbortController | null>(null);
	const [streaming, setStreaming] = useState(false);
	const [startError, setStartError] = useState<string | null>(null);
	const meta = { suppressGlobalErrorToast: true };

	const settings = useQuery({
		...orpc.businessContext.get.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: scope !== null,
		meta,
		staleTime: 0,
		refetchOnWindowFocus: !streaming,
		refetchInterval: ({ state }) =>
			!streaming && state.data && businessContextIsGenerating(state.data)
				? 2000
				: false,
	});
	const accessEnabled = scope !== null && settings.data?.canEdit === true;
	const access = useQuery({
		...orpc.businessContext.generationAccess.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: accessEnabled,
		meta,
		staleTime: 30_000,
		retry: false,
	});

	useEffect(
		() => () => {
			stream.current?.abort();
			stream.current = null;
		},
		[]
	);

	const start = useCallback(async () => {
		if (!scope || stream.current) {
			return;
		}
		const controller = new AbortController();
		stream.current = controller;
		setStreaming(true);
		setStartError(null);
		try {
			await queryClient.cancelQueries({ queryKey: settingsKey });
			const events = await orpc.businessContext.generate.call(scope, {
				signal: controller.signal,
			});
			for await (const result of events) {
				if (controller.signal.aborted) {
					break;
				}
				queryClient.setQueryData(settingsKey, result);
			}
		} catch (error) {
			if (!controller.signal.aborted) {
				setStartError(
					getUserFacingErrorMessage(
						error,
						"Databunny couldn't start reading the site."
					)
				);
			}
		} finally {
			if (stream.current === controller) {
				stream.current = null;
				setStreaming(false);
				queryClient.invalidateQueries({ queryKey: settingsKey });
			}
		}
	}, [queryClient, scope, settingsKey]);

	const save = useMutation({
		...orpc.businessContext.save.mutationOptions(),
		meta,
		onSuccess: (result) => {
			queryClient.setQueryData(settingsKey, result);
		},
	});

	const saveTeamContext = useCallback(
		async (teamContext: BusinessTeamContext) => {
			if (!organizationId) {
				return;
			}
			const current = settings.data;
			const draft =
				current?.generation?.status === "ready" && current.generation.draft
					? current.generation
					: null;
			await save.mutateAsync({
				organizationId,
				revision: current?.profile?.revision ?? 0,
				content: draft?.draft?.content ?? current?.profile?.content ?? "",
				generationId: draft?.id,
				teamContext,
			});
		},
		[organizationId, save, settings.data]
	);

	const readOnly = settings.data?.canEdit === false;

	return {
		research: deriveResearch({
			accessMessage: readOnly
				? "Ask an organization admin to let Databunny read the site."
				: (access.data?.message ?? null),
			accessPending: access.isPending && accessEnabled,
			accessStatus: readOnly ? "read-only" : (access.data?.status ?? null),
			settings: settings.data,
			startError,
			website,
		}),
		start,
		saveTeamContext,
		saving: save.isPending,
		saveError: save.error
			? getUserFacingErrorMessage(save.error, "Couldn't save your answers.")
			: null,
	};
}

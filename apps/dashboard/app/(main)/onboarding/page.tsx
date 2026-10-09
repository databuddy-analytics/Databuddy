"use client";

import { isSelfHosted } from "@databuddy/env/public";
import type {
	BusinessSuggestedFunnel,
	BusinessSuggestedGoal,
} from "@databuddy/shared/organization-business-context";
import type { OnboardingWant } from "@databuddy/shared/custom-events";
import {
	GATED_FEATURES,
	type GatedFeatureId,
	getPlanDisplayName,
} from "@databuddy/shared/types/features";
import { authClient } from "@databuddy/auth/client";
import { roleHasPermission } from "@databuddy/auth/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFlags } from "@databuddy/sdk/react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsArrayOf, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { trackOpenAiRegistrationCompleted } from "@/components/openai-ads-pixel";
import { ApiKeySheet } from "@/components/organizations/api-key-sheet";
import {
	useBillingContext,
	useInvestigationUsage,
} from "@/components/providers/billing-provider";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useCreateWebsite, useWebsitesLight } from "@/hooks/use-websites";
import {
	APP_EVENTS,
	clearOnboardingAttribution,
	consumePendingSocialSignup,
	type OnboardingAttributionProperties,
	readOnboardingAttribution,
	toOnboardingAttribution,
	trackAppEvent,
} from "@/lib/app-events";
import { orpc } from "@/lib/orpc";
import { LinkSheet } from "@/app/(main)/links/_components/link-sheet";
import { generateMcpAgentPrompt } from "@/app/(main)/websites/[id]/_components/utils/code-generators";
import { isDashboardE2E } from "@/lib/e2e-mode";
import { showErrorToast } from "@/lib/user-facing-error";
import { ChoosePlan } from "./_components/choose-plan";
import type { WebsiteFormValues } from "./_components/add-website";
import { suggestionKey } from "./_components/read-site";
import {
	SetupChecklist,
	type SetupWebsite,
} from "./_components/setup-checklist";
import { useAgentInstall } from "@/hooks/use-agent-install";
import { useSiteResearch } from "@/hooks/use-site-research";
import {
	priorityFor,
	primaryWant,
	WANT_IDS,
	WhatMatters,
} from "./_components/what-matters";

// Personal and throwaway providers seen in sign-ups and the referrer list; a
// work address is the only one worth suggesting as the website.
const FREE_MAIL_DOMAINS = new Set([
	"0.email",
	"10minutemail.com",
	"126.com",
	"163.com",
	"a7gi.ru",
	"aol.com",
	"att.net",
	"bellsouth.net",
	"bigpond.com",
	"centrum.cz",
	"comcast.net",
	"cox.net",
	"daum.net",
	"earthlink.net",
	"fastmail.com",
	"free.fr",
	"freenet.de",
	"gmail.com",
	"gmx.com",
	"gmx.de",
	"gmx.net",
	"googlemail.com",
	"guerrillamail.com",
	"hey.com",
	"hotmail.co.uk",
	"hotmail.com",
	"hotmail.de",
	"hotmail.fr",
	"icloud.com",
	"iinet.net.au",
	"inbox.com",
	"laposte.net",
	"libero.it",
	"live.com",
	"mail.com",
	"mail.ru",
	"mailbox.org",
	"mailinator.com",
	"me.com",
	"msn.com",
	"naver.com",
	"optusnet.com.au",
	"orange.fr",
	"outlook.com",
	"passmail.net",
	"pm.me",
	"proton.me",
	"protonmail.com",
	"qq.com",
	"rambler.ru",
	"sbcglobal.net",
	"seznam.cz",
	"sharklasers.com",
	"t-online.de",
	"temp-mail.org",
	"tuta.io",
	"tutanota.com",
	"ukr.net",
	"verizon.net",
	"wanadoo.fr",
	"web.de",
	"yahoo.com",
	"yandex.com",
	"yandex.ru",
	"yopmail.com",
	"zoho.com",
]);

const SECOND_LEVEL_SUFFIXES = new Set([
	"ac",
	"co",
	"com",
	"edu",
	"gov",
	"net",
	"org",
]);

/** jane@eu.acme.com suggests acme.com; jane@team.acme.co.uk suggests acme.co.uk. */
function domainFromEmail(email: string | undefined): string | null {
	const host = email?.split("@")[1]?.toLowerCase();
	if (!host || host.endsWith(".local")) {
		return null;
	}
	const labels = host.split(".");
	const tail =
		labels.length > 2 &&
		labels.at(-1)?.length === 2 &&
		SECOND_LEVEL_SUFFIXES.has(labels.at(-2) ?? "")
			? 3
			: 2;
	const domain = labels.slice(-tail).join(".");
	return FREE_MAIL_DOMAINS.has(domain) || FREE_MAIL_DOMAINS.has(host)
		? null
		: domain;
}

function OnboardingFlow() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [requestedWebsiteId, setRequestedWebsiteId] = useQueryState("website");
	const [step, setStep] = useQueryState("step", parseAsStringLiteral(["plan"]));
	const resumedAtPlanRef = useRef(step === "plan");
	const { isOn } = useFlags();
	const billing = useBillingContext();
	const investigations = useInvestigationUsage();
	const { activeOrganization } = useOrganizationsContext();
	const organizationId = activeOrganization?.id;
	const { websites, isLoading: loadingWebsites } = useWebsitesLight();
	const { data: session } = authClient.useSession();
	const createWebsite = useCreateWebsite();
	const queryClient = useQueryClient();
	const createGoal = useMutation({
		...orpc.goals.create.mutationOptions(),
		meta: { suppressGlobalErrorToast: true },
	});
	const createFunnel = useMutation({
		...orpc.funnels.create.mutationOptions(),
		meta: { suppressGlobalErrorToast: true },
	});

	const startedRef = useRef(false);
	const completedRef = useRef(false);
	const verifiedTrackedRef = useRef<string | null>(null);
	const researchStartedRef = useRef<string | null>(null);

	const [createdWebsite, setCreatedWebsite] = useState<SetupWebsite | null>(
		null
	);
	const [trackingSkipped, setTrackingSkipped] = useState(false);
	const [wants, setWants] = useQueryState(
		"want",
		parseAsArrayOf(parseAsStringLiteral(WANT_IDS))
	);
	const [wantsDraft, setWantsDraft] = useState<OnboardingWant[]>(["analytics"]);
	const [mcpCopied, setMcpCopied] = useState(false);
	const [openSheet, setOpenSheet] = useState<
		"apiKey" | "link" | "monitor" | null
	>(null);
	const closeSheet = (open: boolean) => {
		if (!open) {
			setOpenSheet(null);
		}
	};
	const [createdSuggestions, setCreatedSuggestions] = useState<Set<string>>(
		() => new Set()
	);
	const [attribution, setAttribution] =
		useState<OnboardingAttributionProperties>(readOnboardingAttribution);

	const existingWebsite =
		websites.find((item) => item.id === requestedWebsiteId) ?? websites[0];
	const website = useMemo<SetupWebsite | null>(
		() =>
			createdWebsite ??
			(existingWebsite
				? {
						id: existingWebsite.id,
						domain: existingWebsite.domain,
						name: existingWebsite.name ?? existingWebsite.domain,
					}
				: null),
		[createdWebsite, existingWebsite]
	);
	const websiteId = website?.id ?? null;

	const research = useSiteResearch(organizationId, website);
	const picks = wants ?? [];
	const primary = primaryWant(picks);

	const monitor = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId: websiteId ?? "" },
		}),
		enabled: Boolean(websiteId) && picks.includes("uptime"),
	});
	const existingGoals = useQuery({
		...orpc.goals.list.queryOptions({ input: { websiteId: websiteId ?? "" } }),
		enabled: Boolean(websiteId),
	});
	const existingFunnels = useQuery({
		...orpc.funnels.list.queryOptions({
			input: { websiteId: websiteId ?? "" },
		}),
		enabled: Boolean(websiteId),
	});
	function planLimitNote(
		feature: GatedFeatureId,
		existing: number | undefined,
		unit: string
	): string | null {
		const { limit } = billing.getGatedFeatureAccess(feature);
		if (
			typeof limit !== "number" ||
			existing === undefined ||
			existing < limit
		) {
			return null;
		}
		return `${getPlanDisplayName(billing.currentPlanId)} plan includes ${limit} ${limit === 1 ? unit : `${unit}s`}`;
	}
	const memberRole = authClient.useActiveMemberRole().data?.role ?? null;
	const monitorBlockedRole =
		memberRole && !roleHasPermission(memberRole, "monitor", ["create"])
			? memberRole
			: null;
	const createMonitor = useMutation({
		...orpc.uptime.createSchedule.mutationOptions(),
		meta: { errorTitle: "Failed to start monitoring" },
	});
	const firstLink = useQuery({
		...orpc.links.paginated.queryOptions({
			input: { organizationId, limit: 1 },
		}),
		enabled: Boolean(organizationId) && picks.includes("links"),
	});

	const install = useAgentInstall(websiteId);
	const verifiedWebsiteId = install.verified ? websiteId : null;

	useEffect(() => {
		if (startedRef.current) {
			return;
		}
		startedRef.current = true;
		if (resumedAtPlanRef.current) {
			return;
		}
		const signupProperties = consumePendingSocialSignup();
		const onboardingAttribution =
			signupProperties === null
				? readOnboardingAttribution()
				: toOnboardingAttribution(signupProperties);
		if (signupProperties) {
			trackAppEvent(APP_EVENTS.signupCompleted, signupProperties, {
				flush: true,
			});
			trackOpenAiRegistrationCompleted();
		}
		setAttribution(onboardingAttribution);
		trackAppEvent(APP_EVENTS.onboardingStarted, onboardingAttribution);
	}, []);

	useEffect(() => {
		if (
			!verifiedWebsiteId ||
			verifiedTrackedRef.current === verifiedWebsiteId ||
			resumedAtPlanRef.current
		) {
			return;
		}
		verifiedTrackedRef.current = verifiedWebsiteId;
		trackAppEvent(APP_EVENTS.onboardingTrackingVerified);
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "tracking",
			verified: true,
		});
	}, [verifiedWebsiteId]);

	useEffect(() => {
		if (
			!(createdWebsite && research.research.canStart) ||
			researchStartedRef.current === createdWebsite.id
		) {
			return;
		}
		researchStartedRef.current = createdWebsite.id;
		research.start();
	}, [createdWebsite, research.research.canStart, research.start]);

	async function addWebsite(values: WebsiteFormValues) {
		try {
			const result = await createWebsite.mutateAsync({
				...values,
				organizationId,
			});
			setCreatedWebsite({
				id: result.id,
				domain: result.domain,
				name: result.name ?? values.name,
			});
			trackAppEvent(APP_EVENTS.onboardingWebsiteCreated, attribution);
			trackAppEvent(APP_EVENTS.onboardingStepCompleted, { step: "website" });
		} catch (error: unknown) {
			showErrorToast(error, "Failed to create website");
		}
	}

	async function createSuggestion(
		suggestion: BusinessSuggestedFunnel | BusinessSuggestedGoal
	) {
		if (!websiteId) {
			return;
		}
		const isFunnel = "steps" in suggestion;
		try {
			if (isFunnel) {
				const funnel = await createFunnel.mutateAsync({
					websiteId,
					name: suggestion.name,
					description: suggestion.reason || undefined,
					steps: suggestion.steps,
				});
				queryClient.setQueryData(
					orpc.funnels.list.queryKey({ input: { websiteId } }),
					(funnels) => (funnels ? [funnel, ...funnels] : funnels)
				);
			} else {
				const goal = await createGoal.mutateAsync({
					websiteId,
					name: suggestion.name,
					type: suggestion.type,
					target: suggestion.target,
					description: suggestion.reason || null,
				});
				queryClient.setQueryData(
					orpc.goals.list.queryKey({ input: { websiteId } }),
					(goals) => (goals ? [goal, ...goals] : goals)
				);
			}
			setCreatedSuggestions(
				(prev) => new Set([...prev, suggestionKey(suggestion)])
			);
			queryClient.invalidateQueries({
				queryKey: isFunnel ? orpc.funnels.key() : orpc.goals.key(),
			});
			toast.success(
				`${isFunnel ? "Funnel" : "Goal"} "${suggestion.name}" created`
			);
		} catch (error: unknown) {
			showErrorToast(
				error,
				`Failed to create the ${isFunnel ? "funnel" : "goal"}`
			);
		}
	}

	function skipTracking() {
		setTrackingSkipped(true);
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "tracking",
			verified: false,
		});
	}

	function continueWithWants() {
		setWants(wantsDraft);
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "wants",
			wants: [...wantsDraft].sort().join(","),
		});
	}

	function toggleWant(want: OnboardingWant) {
		setWantsDraft((current) =>
			current.includes(want)
				? current.filter((item) => item !== want)
				: [...current, want]
		);
	}

	function changeWants() {
		setWantsDraft(picks);
		setWants(null);
	}

	function startMonitoring() {
		if (!(website && organizationId)) {
			return;
		}
		createMonitor.mutate(
			{
				url: `https://${website.domain}`,
				name: website.name,
				organizationId,
				websiteId: website.id,
				granularity: "ten_minutes",
			},
			{ onSuccess: () => monitor.refetch() }
		);
	}

	async function copyMcpPrompt() {
		try {
			await navigator.clipboard.writeText(generateMcpAgentPrompt());
		} catch {
			toast.error("Failed to copy the prompt", {
				description:
					"The browser blocked the clipboard. Allow it and try again.",
			});
			return;
		}
		setMcpCopied(true);
	}

	function leave(path: string) {
		if (!completedRef.current) {
			completedRef.current = true;
			trackAppEvent(APP_EVENTS.onboardingCompleted, attribution);
			clearOnboardingAttribution();
		}
		router.replace(path);
	}

	const billingPending = billing.isLoading || billing.isFetching;
	const canReview = !billing.isError && investigations.hasAccess;
	const reviewPending = verifiedWebsiteId !== null && billingPending;
	const reviewFailed =
		verifiedWebsiteId !== null && billing.isError && !billingPending;
	const opensInsights = verifiedWebsiteId !== null && canReview;
	const offersPlans =
		!(isSelfHosted || isDashboardE2E || billing.isLoading || billing.isError) &&
		billing.canUserUpgrade &&
		isOn("onboarding-plan-step");

	function choosePlan() {
		setRequestedWebsiteId(websiteId);
		setStep("plan");
	}

	function finishWithPlan() {
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, { step: "billing" });
		finish();
	}

	async function finish() {
		if (!websiteId) {
			return;
		}
		if (research.canEdit) {
			try {
				await research.savePriority(
					research.savedPriority || priorityFor(picks)
				);
			} catch (error: unknown) {
				showErrorToast(error, "Failed to save your picks");
			}
		}
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "finish",
			origin: research.research.phase === "ready" ? "ai" : "manual",
			intent: primary?.intent,
		});
		if (verifiedWebsiteId && canReview) {
			leave(`/insights?firstReview=${encodeURIComponent(verifiedWebsiteId)}`);
			return;
		}
		leave(`/websites/${websiteId}${primary?.path ?? ""}`);
	}

	function skipSetup() {
		const step = wants ? (website ? "tracking" : "website") : "wants";
		trackAppEvent(APP_EVENTS.onboardingSkipped, {
			skipped_at_step: step,
			step_number: ["wants", "website", "tracking"].indexOf(step) + 1,
		});
		router.push(websiteId ? `/websites/${websiteId}` : "/websites");
	}

	if (!wants) {
		return (
			<WhatMatters
				onContinue={continueWithWants}
				onToggle={toggleWant}
				selected={wantsDraft}
			/>
		);
	}

	const leaveAction = {
		label: reviewPending
			? "Checking Insights…"
			: opensInsights
				? "Open Insights"
				: "Open dashboard",
		loading: reviewPending || research.saving,
		note: reviewFailed
			? "Failed to check Insights."
			: opensInsights
				? "Your first review runs once there is enough history to compare."
				: null,
		onRetry: reviewFailed ? billing.refetch : undefined,
	};

	if (step === "plan" && websiteId && offersPlans) {
		return (
			<ChoosePlan
				finish={{ ...leaveAction, onClick: finishWithPlan }}
				onBack={() => {
					resumedAtPlanRef.current = false;
					setStep(null);
				}}
				successPath={`/onboarding?${searchParams.toString()}`}
			/>
		);
	}

	return (
		<>
			<SetupChecklist
				agentProgress={install.agentProgress}
				creating={createWebsite.isPending}
				loadingWebsites={loadingWebsites && !createdWebsite}
				finish={
					websiteId
						? offersPlans
							? { label: "Continue", onClick: choosePlan }
							: { ...leaveAction, onClick: finish }
						: null
				}
				onChangeWants={changeWants}
				onCopy={(method, agent) => {
					install.markCopied();
					trackAppEvent(APP_EVENTS.onboardingTrackingCopied, {
						block: agent ?? method,
						method,
					});
				}}
				onCreateWebsite={addWebsite}
				onSkipSetup={skipSetup}
				onSkipTracking={skipTracking}
				onStartResearch={research.start}
				products={{
					linksCreated: (firstLink.data?.items.length ?? 0) > 0,
					mcpCopied,
					monitor: {
						blockedRole: monitorBlockedRole,
						creating: createMonitor.isPending,
						exists: Boolean(monitor.data),
					},
					onCopyMcp: copyMcpPrompt,
					onCreateApiKey: () => setOpenSheet("apiKey"),
					onCreateLink: () => setOpenSheet("link"),
					onCreateMonitor: startMonitoring,
					onEditMonitor: () => setOpenSheet("monitor"),
				}}
				research={research.research}
				setupSession={install.setupSession}
				suggestedDomain={domainFromEmail(session?.user.email)}
				suggestions={{
					created: createdSuggestions,
					creating: createGoal.isPending
						? `goal:${createGoal.variables.name}`
						: createFunnel.isPending
							? `funnel:${createFunnel.variables.name}`
							: null,
					limitNotes: {
						goal: planLimitNote(
							GATED_FEATURES.GOALS,
							existingGoals.data?.length,
							"goal"
						),
						funnel: planLimitNote(
							GATED_FEATURES.FUNNELS,
							existingFunnels.data?.length,
							"funnel"
						),
					},
					onCreate: createSuggestion,
				}}
				tracking={install.tracking}
				trackingCopied={install.copied}
				trackingSkipped={trackingSkipped}
				wants={picks}
				website={website}
			/>
			<MonitorSheet
				onCloseAction={closeSheet}
				open={openSheet === "monitor"}
				schedule={monitor.data}
				websiteId={websiteId ?? undefined}
			/>
			<LinkSheet
				onOpenChange={closeSheet}
				onSave={() => firstLink.refetch()}
				open={openSheet === "link"}
			/>
			{organizationId ? (
				<ApiKeySheet
					apiKey={null}
					onOpenChangeAction={closeSheet}
					open={openSheet === "apiKey"}
					organizationId={organizationId}
				/>
			) : null}
		</>
	);
}

export default function OnboardingPage() {
	return (
		<Suspense fallback={null}>
			<OnboardingFlow />
		</Suspense>
	);
}

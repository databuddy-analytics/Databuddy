"use client";

import type {
	BusinessSuggestedFunnel,
	BusinessSuggestedGoal,
} from "@databuddy/shared/organization-business-context";
import { authClient } from "@databuddy/auth/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trackOpenAiRegistrationCompleted } from "@/components/openai-ads-pixel";
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
import { showErrorToast } from "@/lib/user-facing-error";
import type { WebsiteFormValues } from "./_components/add-website";
import { suggestionKey } from "./_components/read-site";
import {
	SetupChecklist,
	type SetupWebsite,
} from "./_components/setup-checklist";
import { useOnboardingResearch } from "./_components/use-onboarding-research";
import { INTENT_OPTIONS, intentFor } from "./_components/what-matters";

const POLL_MS = 5000;
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
	const requestedWebsiteId = useSearchParams().get("website");
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
	const [setupSession] = useState(() =>
		crypto.randomUUID().replaceAll("-", "").slice(0, 16)
	);
	const [trackingCopied, setTrackingCopied] = useState(false);
	const [trackingSkipped, setTrackingSkipped] = useState(false);
	const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
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

	const research = useOnboardingResearch(organizationId, website);
	const priority = priorityDraft ?? research.savedPriority;
	const prioritySaved =
		priority.trim() !== "" && priority.trim() === research.savedPriority;
	const intent = intentFor(priority);

	const trackingQuery = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({
			input: { websiteId: websiteId ?? "" },
		}),
		enabled: websiteId !== null,
		refetchInterval: ({ state }) =>
			state.data?.tracking_setup ? false : POLL_MS,
		staleTime: 0,
	});
	const trackingSetup = trackingQuery.data?.tracking_setup ?? false;
	const verifiedWebsiteId = trackingSetup ? websiteId : null;

	const agentProgressQuery = useQuery({
		...orpc.websites.agentInstallProgress.queryOptions({
			input: { websiteId: websiteId ?? "", setupSession },
		}),
		enabled: websiteId !== null && trackingCopied && !trackingSetup,
		meta: { suppressGlobalErrorToast: true },
		refetchInterval: ({ state }) =>
			state.data?.status === "success" || state.data?.status === "failed"
				? false
				: POLL_MS,
		staleTime: 0,
	});

	useEffect(() => {
		if (startedRef.current) {
			return;
		}
		startedRef.current = true;
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
			verifiedTrackedRef.current === verifiedWebsiteId
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
			showErrorToast(error, "Failed to create website.");
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
				await createFunnel.mutateAsync({
					websiteId,
					name: suggestion.name,
					description: suggestion.reason || undefined,
					steps: suggestion.steps,
				});
			} else {
				await createGoal.mutateAsync({
					websiteId,
					name: suggestion.name,
					type: suggestion.type,
					target: suggestion.target,
					description: suggestion.reason || null,
				});
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
				`Couldn't create the ${isFunnel ? "funnel" : "goal"}.`
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

	async function savePriority() {
		const trimmed = priority.trim();
		if (!trimmed) {
			return;
		}
		try {
			await research.savePriority(trimmed);
		} catch {
			return;
		}
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "finish",
			origin: research.research.phase === "ready" ? "ai" : "manual",
			intent: intent ?? undefined,
		});
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

	function finish() {
		if (!websiteId) {
			return;
		}
		if (verifiedWebsiteId && canReview) {
			leave(`/insights?firstReview=${encodeURIComponent(verifiedWebsiteId)}`);
			return;
		}
		const path = INTENT_OPTIONS.find((option) => option.id === intent)?.path;
		leave(`/websites/${websiteId}${path ?? ""}`);
	}

	function skipSetup() {
		const step = website ? (prioritySaved ? "finish" : "tracking") : "website";
		trackAppEvent(APP_EVENTS.onboardingSkipped, {
			skipped_at_step: step,
			step_number: ["website", "tracking", "finish"].indexOf(step) + 1,
		});
		router.push(websiteId ? `/websites/${websiteId}` : "/websites");
	}

	return (
		<SetupChecklist
			agentProgress={agentProgressQuery.data ?? null}
			creating={createWebsite.isPending}
			loadingWebsites={loadingWebsites && !createdWebsite}
			finish={
				websiteId
					? {
							label: reviewPending
								? "Checking Insights"
								: opensInsights
									? "Open Insights"
									: "Open dashboard",
							onClick: finish,
							loading: reviewPending,
							note: reviewFailed
								? "We couldn't check Insights."
								: opensInsights
									? "Your first review runs once there is enough history to compare."
									: null,
							onRetry: reviewFailed ? billing.refetch : undefined,
						}
					: null
			}
			onChangePriority={setPriorityDraft}
			onCopy={(method, agent) => {
				setTrackingCopied(true);
				trackAppEvent(APP_EVENTS.onboardingTrackingCopied, {
					block: agent ?? method,
					method,
				});
			}}
			onCreateWebsite={addWebsite}
			onSavePriority={savePriority}
			onSkipSetup={skipSetup}
			onSkipTracking={skipTracking}
			onStartResearch={research.start}
			priority={priority}
			prioritySaved={prioritySaved}
			research={research.research}
			saveError={research.saveError}
			saving={research.saving}
			setupSession={setupSession}
			suggestedDomain={domainFromEmail(session?.user.email)}
			suggestions={{
				created: createdSuggestions,
				creating: createGoal.isPending
					? `goal:${createGoal.variables.name}`
					: createFunnel.isPending
						? `funnel:${createFunnel.variables.name}`
						: null,
				onCreate: createSuggestion,
			}}
			tracking={{
				state: trackingSetup
					? "verified"
					: trackingQuery.isError
						? "error"
						: "awaiting",
				issue: trackingQuery.data?.tracking_issue ?? null,
			}}
			trackingCopied={trackingCopied}
			trackingSkipped={trackingSkipped}
			website={website}
		/>
	);
}

export default function OnboardingPage() {
	return (
		<Suspense fallback={null}>
			<OnboardingFlow />
		</Suspense>
	);
}

"use client";

import type { OnboardingIntent } from "@databuddy/shared/custom-events";
import type {
	BusinessSuggestedFunnel,
	BusinessSuggestedGoal,
} from "@databuddy/shared/organization-business-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import type { TrackingStatus } from "./_components/connect-app";
import { suggestionKey } from "./_components/read-site";
import {
	SetupChecklist,
	type SetupWebsite,
} from "./_components/setup-checklist";
import { useOnboardingResearch } from "./_components/use-onboarding-research";
import { INTENT_OPTIONS } from "./_components/what-matters";

const TRACKING_POLL_MS = 5000;

function newSetupSession(): string {
	return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

function OnboardingFlow() {
	const router = useRouter();
	const requestedWebsiteId = useSearchParams().get("website");
	const billing = useBillingContext();
	const investigations = useInvestigationUsage();
	const billingPending = billing.isLoading || billing.isFetching;
	const canReview = !billing.isError && investigations.hasAccess;
	const { activeOrganization } = useOrganizationsContext();
	const organizationId = activeOrganization?.id;
	const { websites } = useWebsitesLight();
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
	const [createdSuggestions, setCreatedSuggestions] = useState<Set<string>>(
		() => new Set()
	);
	const [creatingSuggestion, setCreatingSuggestion] = useState<string | null>(
		null
	);

	const startedRef = useRef(false);
	const completedRef = useRef(false);
	const verifiedRef = useRef<string | null>(null);
	const researchStartedRef = useRef<string | null>(null);

	const [createdWebsite, setCreatedWebsite] = useState<SetupWebsite | null>(
		null
	);
	const [verifiedWebsiteId, setVerifiedWebsiteId] = useState<string | null>(
		null
	);
	const [trackingCopied, setTrackingCopied] = useState(false);
	const [setupSession] = useState(newSetupSession);
	const [trackingSkipped, setTrackingSkipped] = useState(false);
	const [priority, setPriority] = useState("");
	const [intent, setIntent] = useState<OnboardingIntent | null>(null);
	const [prioritySaved, setPrioritySaved] = useState(false);
	const [attribution, setAttribution] =
		useState<OnboardingAttributionProperties>(() =>
			readOnboardingAttribution()
		);

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

	const trackingQuery = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({
			input: { websiteId: websiteId ?? "" },
		}),
		enabled: websiteId !== null,
		refetchInterval: ({ state }) =>
			state.data?.tracking_setup ? false : TRACKING_POLL_MS,
		staleTime: 0,
	});
	const trackingSetup = trackingQuery.data?.tracking_setup ?? false;

	const agentProgressQuery = useQuery({
		...orpc.websites.agentInstallProgress.queryOptions({
			input: { websiteId: websiteId ?? "", setupSession },
		}),
		enabled: websiteId !== null && trackingCopied && !trackingSetup,
		meta: { suppressGlobalErrorToast: true },
		refetchInterval: ({ state }) =>
			state.data?.status === "success" || state.data?.status === "failed"
				? false
				: TRACKING_POLL_MS,
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
		if (!(trackingSetup && websiteId) || verifiedRef.current === websiteId) {
			return;
		}
		verifiedRef.current = websiteId;
		setVerifiedWebsiteId(websiteId);
		trackAppEvent(APP_EVENTS.onboardingTrackingVerified);
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "tracking",
			verified: true,
		});
	}, [trackingSetup, websiteId]);

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

	const handleCreateWebsite = useCallback(
		async (values: WebsiteFormValues) => {
			try {
				const result = await createWebsite.mutateAsync({
					name: values.name,
					domain: values.domain,
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
		},
		[attribution, createWebsite, organizationId]
	);

	const handleCreateGoal = useCallback(
		async (goal: BusinessSuggestedGoal) => {
			if (!websiteId) {
				return;
			}
			const key = suggestionKey(goal);
			setCreatingSuggestion(key);
			try {
				await createGoal.mutateAsync({
					websiteId,
					name: goal.name,
					type: goal.type,
					target: goal.target,
					description: goal.reason || null,
				});
				setCreatedSuggestions((prev) => new Set([...prev, key]));
				queryClient.invalidateQueries({ queryKey: orpc.goals.key() });
				toast.success(`Goal "${goal.name}" created`);
			} catch (error: unknown) {
				showErrorToast(error, "Couldn't create the goal.");
			} finally {
				setCreatingSuggestion(null);
			}
		},
		[createGoal, queryClient, websiteId]
	);

	const handleCreateFunnel = useCallback(
		async (funnel: BusinessSuggestedFunnel) => {
			if (!websiteId) {
				return;
			}
			const key = suggestionKey(funnel);
			setCreatingSuggestion(key);
			try {
				await createFunnel.mutateAsync({
					websiteId,
					name: funnel.name,
					description: funnel.reason || undefined,
					steps: funnel.steps.map((step) => ({
						name: step.name,
						type: step.type,
						target: step.target,
					})),
				});
				setCreatedSuggestions((prev) => new Set([...prev, key]));
				queryClient.invalidateQueries({ queryKey: orpc.funnels.key() });
				toast.success(`Funnel "${funnel.name}" created`);
			} catch (error: unknown) {
				showErrorToast(error, "Couldn't create the funnel.");
			} finally {
				setCreatingSuggestion(null);
			}
		},
		[createFunnel, queryClient, websiteId]
	);

	const handleSkipTracking = useCallback(() => {
		setTrackingSkipped(true);
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "tracking",
			verified: false,
		});
	}, []);

	const handleSavePriority = useCallback(async () => {
		const trimmed = priority.trim();
		if (!trimmed) {
			return;
		}
		try {
			await research.saveTeamContext({
				priority: trimmed,
				successDefinition: "",
				exclusions: "",
			});
		} catch {
			return;
		}
		setPrioritySaved(true);
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "finish",
			origin: research.research.phase === "ready" ? "ai" : "manual",
			intent: intent ?? undefined,
		});
	}, [intent, priority, research]);

	const leave = useCallback(
		(path: string) => {
			if (!completedRef.current) {
				completedRef.current = true;
				trackAppEvent(APP_EVENTS.onboardingCompleted, attribution);
				clearOnboardingAttribution();
			}
			router.replace(path);
		},
		[attribution, router]
	);

	const handleFinish = useCallback(() => {
		if (!websiteId) {
			return;
		}
		const pendingPlan = localStorage.getItem("pendingPlanSelection");
		if (pendingPlan) {
			localStorage.removeItem("pendingPlanSelection");
			leave(`/billing/plans?plan=${encodeURIComponent(pendingPlan)}`);
			return;
		}
		if (verifiedWebsiteId && canReview) {
			leave(`/insights?firstReview=${encodeURIComponent(verifiedWebsiteId)}`);
			return;
		}
		const path = INTENT_OPTIONS.find((option) => option.id === intent)?.path;
		leave(`/websites/${websiteId}${path ?? ""}`);
	}, [canReview, intent, leave, verifiedWebsiteId, websiteId]);

	const handleSkipSetup = useCallback(() => {
		trackAppEvent(APP_EVENTS.onboardingSkipped, {
			skipped_at_step: website
				? trackingSetup || trackingSkipped
					? "finish"
					: "tracking"
				: "website",
			step_number: website ? (trackingSetup || trackingSkipped ? 3 : 2) : 1,
		});
		router.push(websiteId ? `/websites/${websiteId}` : "/websites");
	}, [router, trackingSetup, trackingSkipped, website, websiteId]);

	const tracking: TrackingStatus = {
		state: trackingSetup
			? "verified"
			: trackingQuery.isError
				? "error"
				: "awaiting",
		issue: trackingQuery.data?.tracking_issue
			? {
					message: trackingQuery.data.tracking_issue.message,
					fix: trackingQuery.data.tracking_issue.fix,
				}
			: null,
	};

	const reviewPending = verifiedWebsiteId !== null && billingPending;
	const reviewFailed =
		verifiedWebsiteId !== null && billing.isError && !billingPending;
	const opensInsights = verifiedWebsiteId !== null && canReview;

	return (
		<SetupChecklist
			agentProgress={agentProgressQuery.data ?? null}
			creating={createWebsite.isPending}
			finish={
				websiteId
					? {
							label: reviewPending
								? "Checking Insights"
								: opensInsights
									? "Open Insights"
									: "Open dashboard",
							onClick: handleFinish,
							disabled: reviewPending,
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
			intent={intent}
			onChangeIntent={setIntent}
			onChangePriority={setPriority}
			onCopy={(method, agent) => {
				setTrackingCopied(true);
				trackAppEvent(APP_EVENTS.onboardingTrackingCopied, {
					block: agent ?? method,
					method,
				});
			}}
			onCreateWebsite={handleCreateWebsite}
			onSavePriority={handleSavePriority}
			onSkipSetup={handleSkipSetup}
			onSkipTracking={handleSkipTracking}
			onStartResearch={research.start}
			priority={priority}
			prioritySaved={prioritySaved}
			research={research.research}
			saveError={research.saveError}
			saving={research.saving}
			setupSession={setupSession}
			suggestions={{
				created: createdSuggestions,
				creating: creatingSuggestion,
				onCreateFunnel: handleCreateFunnel,
				onCreateGoal: handleCreateGoal,
			}}
			tracking={tracking}
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

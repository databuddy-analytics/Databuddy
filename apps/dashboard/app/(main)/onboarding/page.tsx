"use client";

import type {
	OnboardingIntent,
	OnboardingStepId,
} from "@databuddy/shared/custom-events";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import { OnboardingShell } from "./_components/onboarding-shell";
import { INTENT_OPTIONS, StepFinish } from "./_components/step-finish";
import { StepInstall, type TrackingStatus } from "./_components/step-install";
import {
	StepWebsite,
	type WebsiteFormValues,
} from "./_components/step-website";
import { useOnboardingResearch } from "./_components/use-onboarding-research";

const STEP_IDS: OnboardingStepId[] = ["website", "tracking", "finish"];
const TRACKING_POLL_MS = 5000;

function isStepId(value: string | null): value is OnboardingStepId {
	return STEP_IDS.includes(value as OnboardingStepId);
}

function OnboardingFlow() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const billing = useBillingContext();
	const investigations = useInvestigationUsage();
	const billingPending = billing.isLoading || billing.isFetching;
	const canReview = !billing.isError && investigations.hasAccess;
	const { activeOrganization } = useOrganizationsContext();
	const organizationId = activeOrganization?.id;
	const { websites, isLoading: websitesLoading } = useWebsitesLight();
	const createWebsite = useCreateWebsite();

	const trackedStepRef = useRef<OnboardingStepId | null>(null);
	const completedRef = useRef(false);
	const startedRef = useRef(false);
	const verifiedRef = useRef<string | null>(null);
	const researchStartedRef = useRef<string | null>(null);

	const [step, setStep] = useState<OnboardingStepId>(() => {
		const requested = searchParams.get("step");
		return isStepId(requested) ? requested : "website";
	});
	const [createdWebsite, setCreatedWebsite] = useState<{
		domain: string;
		id: string;
		name: string;
	} | null>(null);
	const [verifiedWebsiteId, setVerifiedWebsiteId] = useState<string | null>(
		null
	);
	const [trackingSkipped, setTrackingSkipped] = useState(false);
	const [priority, setPriority] = useState("");
	const [intent, setIntent] = useState<OnboardingIntent | null>(null);
	const [attribution, setAttribution] =
		useState<OnboardingAttributionProperties>(() =>
			readOnboardingAttribution()
		);

	const existingWebsite = websites[0];
	const website = useMemo(
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
		enabled: websiteId !== null && step === "tracking",
		refetchInterval: ({ state }) =>
			state.data?.tracking_setup ? false : TRACKING_POLL_MS,
		staleTime: 0,
	});
	const trackingSetup = trackingQuery.data?.tracking_setup ?? false;

	useEffect(() => {
		window.history.replaceState(null, "", `/onboarding?step=${step}`);
		if (trackedStepRef.current !== step) {
			trackedStepRef.current = step;
			trackAppEvent(APP_EVENTS.onboardingStepViewed, {
				step,
				step_number: STEP_IDS.indexOf(step) + 1,
			});
		}
	}, [step]);

	useEffect(() => {
		if (!(websitesLoading || website)) {
			setStep("website");
		}
	}, [website, websitesLoading]);

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
				setStep("tracking");
			} catch (error: unknown) {
				showErrorToast(error, "Failed to create website.");
			}
		},
		[attribution, createWebsite, organizationId]
	);

	const handleTrackingContinue = useCallback(() => {
		if (!(trackingSetup || trackingSkipped)) {
			setTrackingSkipped(true);
			trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
				step: "tracking",
				verified: false,
			});
		}
		setStep("finish");
	}, [trackingSetup, trackingSkipped]);

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

	const handleFinish = useCallback(async () => {
		if (!websiteId) {
			return;
		}
		const trimmed = priority.trim();
		if (trimmed) {
			try {
				await research.saveTeamContext({
					priority: trimmed,
					successDefinition: "",
					exclusions: "",
				});
			} catch {
				return;
			}
		}
		trackAppEvent(APP_EVENTS.onboardingStepCompleted, {
			step: "finish",
			origin: research.research.phase === "ready" ? "ai" : "manual",
			intent: intent ?? undefined,
		});
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
	}, [
		canReview,
		intent,
		leave,
		priority,
		research,
		verifiedWebsiteId,
		websiteId,
	]);

	const handleSkip = useCallback(() => {
		trackAppEvent(APP_EVENTS.onboardingSkipped, {
			skipped_at_step: step,
			step_number: STEP_IDS.indexOf(step) + 1,
		});
		router.push(websiteId ? `/websites/${websiteId}` : "/websites");
	}, [router, step, websiteId]);

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

	const next =
		step === "tracking" && websiteId
			? {
					label: trackingSetup ? "Continue" : "Skip for now",
					onClick: handleTrackingContinue,
				}
			: step === "finish" && websiteId
				? {
						label: reviewPending
							? "Checking Insights"
							: opensInsights
								? "Open Insights"
								: "Open dashboard",
						onClick: handleFinish,
						disabled: reviewPending,
						loading: reviewPending || research.saving,
					}
				: null;

	return (
		<OnboardingShell
			back={step === "finish" ? () => setStep("tracking") : null}
			next={next}
			onSkip={handleSkip}
			step={STEP_IDS.indexOf(step) + 1}
		>
			{step === "website" ? (
				<StepWebsite
					onCreate={handleCreateWebsite}
					pending={createWebsite.isPending}
				/>
			) : null}
			{step === "tracking" && website ? (
				<StepInstall
					domain={website.domain}
					onCopy={(method) =>
						trackAppEvent(APP_EVENTS.onboardingTrackingCopied, {
							block: method,
							method,
						})
					}
					research={research.research}
					tracking={tracking}
					websiteId={website.id}
				/>
			) : null}
			{step === "finish" && website ? (
				<StepFinish
					intent={intent}
					onChangeIntent={setIntent}
					onChangePriority={setPriority}
					onStartResearch={research.start}
					priority={priority}
					research={research.research}
					review={
						verifiedWebsiteId
							? {
									error: reviewFailed,
									loading: reviewPending,
									onRetry: billing.refetch,
								}
							: null
					}
					saveError={research.saveError}
					websiteName={website.name}
				/>
			) : null}
		</OnboardingShell>
	);
}

export default function OnboardingPage() {
	return (
		<Suspense fallback={null}>
			<OnboardingFlow />
		</Suspense>
	);
}

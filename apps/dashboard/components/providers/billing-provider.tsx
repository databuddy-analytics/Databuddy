"use client";

import {
	type AiCapabilityId,
	FEATURE_METADATA,
	type FeatureId,
	type GatedFeatureId,
	getMinimumPlanForAiCapability,
	getMinimumPlanForFeature,
	getPlanCapabilities as getPlanCapabilitiesForPlan,
	isPlanAiCapabilityEnabled,
	isPlanFeatureEnabled,
	PLAN_IDS,
	type PlanCapabilities,
	type PlanId,
} from "@databuddy/shared/types/features";
import { useQuery } from "@tanstack/react-query";
import { useCustomer, useListPlans } from "autumn-js/react";
import { useParams, usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { orpc } from "@/lib/orpc";

type HookCustomer = NonNullable<ReturnType<typeof useCustomer>["data"]>;
type HookPlan = NonNullable<ReturnType<typeof useListPlans>["data"]>[number];
type HookBalance = NonNullable<HookCustomer["balances"]>[string];

export interface FeatureAccess {
	allowed: boolean;
	balance: number;
	limit: number;
	unlimited: boolean;
	usagePercent: number | null;
}

export interface GatedFeatureAccess {
	allowed: boolean;
	minPlan: PlanId | null;
	upgradeMessage: string | null;
}

export interface BillingContextValue {
	canUse: (featureId: FeatureId | string) => boolean;
	canUserUpgrade: boolean;
	currentPlanId: PlanId | null;
	customer: HookCustomer | null;
	getBalance: (featureId: FeatureId | string) => HookBalance | null;
	getGatedFeatureAccess: (feature: GatedFeatureId) => GatedFeatureAccess;
	getPlanCapabilities: () => PlanCapabilities;
	getUpgradeMessage: (
		featureId: FeatureId | GatedFeatureId | string
	) => string | null;
	getUsage: (featureId: FeatureId | string) => FeatureAccess;
	hasActiveSubscription: boolean;
	isAiCapabilityEnabled: (capability: AiCapabilityId) => boolean;
	isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	isFree: boolean;
	isLoading: boolean;
	isOrganizationBilling: boolean;
	plans: HookPlan[];
	refetch: () => void;
}

const BillingContext = createContext<BillingContextValue | null>(null);

interface BillingProviderProps {
	children: ReactNode;
	/** Optional website ID to get billing context for (for demos/public pages) */
	websiteId?: string;
}

export function BillingProvider({
	children,
	websiteId: propWebsiteId,
}: BillingProviderProps) {
	const params = useParams();
	const pathname = usePathname();

	const isDemoRoute = useMemo(() => pathname?.startsWith("/demo/"), [pathname]);
	const isWebsiteRoute = useMemo(
		() => pathname?.startsWith("/websites/"),
		[pathname]
	);

	const websiteId = useMemo(() => {
		if (propWebsiteId) {
			return propWebsiteId;
		}

		if (isDemoRoute || isWebsiteRoute) {
			const routeId = params?.id;
			if (typeof routeId === "string" && routeId) {
				return routeId;
			}
		}

		return;
	}, [propWebsiteId, params?.id, isDemoRoute, isWebsiteRoute]);

	const {
		data: customer,
		isLoading: isCustomerLoading,
		refetch: refetchCustomer,
	} = useCustomer();

	const {
		data: plans,
		isLoading: isPlansLoading,
		refetch: refetchPlans,
	} = useListPlans();

	// Get the correct billing context (handles org/website ownership)
	// Always fetch billing context - the backend handles both:
	// 1. When websiteId is provided: uses website owner's plan
	// 2. When no websiteId: uses authenticated user's/org's plan
	const {
		data: billingContext,
		isLoading: isBillingContextLoading,
		refetch: refetchBillingContext,
	} = useQuery({
		...orpc.organizations.getBillingContext.queryOptions({
			input: websiteId ? { websiteId } : undefined,
		}),
		retry: false,
		throwOnError: false,
	});

	const value = useMemo<BillingContextValue>(() => {
		const effectivePlanId = (billingContext?.planId ?? PLAN_IDS.FREE) as PlanId;
		const isOrganizationBilling = billingContext?.isOrganization ?? false;
		const canUserUpgrade = billingContext?.canUserUpgrade ?? true;

		const currentPlanId = effectivePlanId;
		const currentPlan = plans?.find((p) => p.id === currentPlanId);
		const isFree =
			currentPlanId === PLAN_IDS.FREE ||
			currentPlan?.autoEnable === true ||
			!billingContext?.hasActiveSubscription;

		const getBalance = (id: FeatureId | string): HookBalance | null =>
			customer?.balances?.[id] ?? null;

		const canUse = (id: FeatureId | string): boolean => {
			const bal = customer?.balances?.[id];
			if (!bal) {
				return false;
			}
			if (bal.unlimited) {
				return true;
			}
			return bal.remaining > 0;
		};

		const getUsage = (id: FeatureId | string): FeatureAccess => {
			const bal = customer?.balances?.[id];
			if (!bal) {
				return {
					allowed: false,
					balance: 0,
					limit: 0,
					unlimited: false,
					usagePercent: null,
				};
			}

			const remaining = bal.remaining;
			const limit = bal.granted;
			const unlimited = bal.unlimited;
			const usagePercent =
				!unlimited && limit > 0
					? Math.round(((limit - remaining) / limit) * 100)
					: null;

			return {
				allowed: unlimited || remaining > 0,
				balance: remaining,
				limit,
				unlimited,
				usagePercent,
			};
		};

		const isFeatureEnabled = (feature: GatedFeatureId): boolean =>
			isPlanFeatureEnabled(currentPlanId, feature);

		const getGatedFeatureAccess = (
			feature: GatedFeatureId
		): GatedFeatureAccess => {
			const allowed = isPlanFeatureEnabled(currentPlanId, feature);
			return {
				allowed,
				minPlan: getMinimumPlanForFeature(feature),
				upgradeMessage: allowed
					? null
					: (FEATURE_METADATA[feature]?.upgradeMessage ?? null),
			};
		};

		const getUpgradeMessage = (
			id: FeatureId | GatedFeatureId | string
		): string | null =>
			FEATURE_METADATA[id as FeatureId | GatedFeatureId]?.upgradeMessage ??
			null;

		const isAiCapabilityEnabled = (capability: AiCapabilityId): boolean =>
			isPlanAiCapabilityEnabled(currentPlanId, capability);

		const getPlanCapabilities = (): PlanCapabilities =>
			getPlanCapabilitiesForPlan(currentPlanId);

		const refetch = () => {
			refetchCustomer();
			refetchBillingContext();
			refetchPlans();
		};

		return {
			customer: customer ?? null,
			plans: plans ?? [],
			isLoading: isCustomerLoading || isPlansLoading || isBillingContextLoading,
			hasActiveSubscription: billingContext?.hasActiveSubscription ?? false,
			currentPlanId,
			isFree,
			isOrganizationBilling,
			canUserUpgrade,
			canUse,
			getUsage,
			getBalance,
			isFeatureEnabled,
			getGatedFeatureAccess,
			getUpgradeMessage,
			isAiCapabilityEnabled,
			getPlanCapabilities,
			refetch,
		};
	}, [
		customer,
		plans,
		billingContext,
		isCustomerLoading,
		isPlansLoading,
		isBillingContextLoading,
		refetchCustomer,
		refetchBillingContext,
		refetchPlans,
	]);

	return (
		<BillingContext.Provider value={value}>{children}</BillingContext.Provider>
	);
}

export function useBillingContext(): BillingContextValue {
	const context = useContext(BillingContext);
	if (!context) {
		throw new Error("useBillingContext must be used within BillingProvider");
	}
	return context;
}

export function useUsageFeature(featureId: FeatureId) {
	const { canUse, getUsage, getUpgradeMessage, isFree } = useBillingContext();
	return {
		...getUsage(featureId),
		canUse: canUse(featureId),
		upgradeMessage: getUpgradeMessage(featureId),
		isFree,
	};
}

export function useGatedFeature(feature: GatedFeatureId) {
	const { isFeatureEnabled, getGatedFeatureAccess, currentPlanId, isFree } =
		useBillingContext();
	return {
		...getGatedFeatureAccess(feature),
		isEnabled: isFeatureEnabled(feature),
		currentPlanId,
		isFree,
	};
}

export function useAiCapability(capability: AiCapabilityId) {
	const { isAiCapabilityEnabled, currentPlanId, isFree, canUserUpgrade } =
		useBillingContext();
	const isEnabled = isAiCapabilityEnabled(capability);
	const minPlan = getMinimumPlanForAiCapability(capability);

	return {
		isEnabled,
		currentPlanId,
		isFree,
		minPlan,
		canUserUpgrade,
	};
}

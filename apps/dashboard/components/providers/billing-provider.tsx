"use client";

import type { Customer, CustomerFeature, Product } from "autumn-js";
import { useCustomer, usePricingTable } from "autumn-js/react";
import { useQuery } from "@tanstack/react-query";
import { useParams, usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { orpc } from "@/lib/orpc";
import {
	AI_CAPABILITIES,
	type AiCapabilityId,
	FEATURE_IDS,
	FEATURE_METADATA,
	type FeatureId,
	GATED_FEATURES,
	type GatedFeatureId,
	getMinimumPlanForAiCapability,
	getMinimumPlanForFeature,
	getPlanCapabilities as getPlanCapabilitiesForPlan,
	isPlanAiCapabilityEnabled,
	isPlanFeatureEnabled,
	PLAN_CAPABILITIES,
	type PlanCapabilities,
	PLAN_IDS,
	type PlanId,
} from "@/types/features";

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
	customer: Customer | null;
	products: Product[];
	isLoading: boolean;
	hasActiveSubscription: boolean;
	currentPlanId: PlanId | null;
	isFree: boolean;
	// Organization context - true if billing is based on org owner
	isOrganizationBilling: boolean;
	// Whether the current user can upgrade (false if viewing org and not owner)
	canUserUpgrade: boolean;
	// Usage-based features
	canUse: (featureId: FeatureId | string) => boolean;
	getUsage: (featureId: FeatureId | string) => FeatureAccess;
	getFeature: (featureId: FeatureId | string) => CustomerFeature | null;
	// Gated features
	isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	getGatedFeatureAccess: (feature: GatedFeatureId) => GatedFeatureAccess;
	getUpgradeMessage: (
		featureId: FeatureId | GatedFeatureId | string
	) => string | null;
	// AI capabilities
	isAiCapabilityEnabled: (capability: AiCapabilityId) => boolean;
	getPlanCapabilities: () => PlanCapabilities;
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

	const websiteId = useMemo(() => {
		if (propWebsiteId) return propWebsiteId;

		const isDemoRoute = pathname?.startsWith("/demo/");
		
		if (isDemoRoute) {
		const routeId = params?.id;
			if (typeof routeId === "string" && routeId) {
			return routeId;
			}
		}

		return undefined;
	}, [propWebsiteId, params?.id, pathname]);

	const {
		customer,
		isLoading: isCustomerLoading,
		refetch: refetchCustomer,
	} = useCustomer();

	const {
		products,
		isLoading: isProductsLoading,
		refetch: refetchProducts,
	} = usePricingTable();

	// Get the correct billing context (handles org/website ownership)
	const {
		data: billingContext,
		isLoading: isBillingContextLoading,
		refetch: refetchBillingContext,
	} = useQuery({
		...orpc.organizations.getBillingContext.queryOptions({
			input: websiteId ? { websiteId } : undefined,
		}),
	});

	const value = useMemo<BillingContextValue>(() => {
		// Use the billing context from backend which correctly handles org ownership
		const effectivePlanId = (billingContext?.planId ?? PLAN_IDS.FREE) as PlanId;
		const isOrganizationBilling = billingContext?.isOrganization ?? false;
		const canUserUpgrade = billingContext?.canUserUpgrade ?? true;

		const currentPlanId = effectivePlanId;
		const currentPlan = products?.find((p) => p.id === currentPlanId);
		const isFree =
			currentPlanId === PLAN_IDS.FREE ||
			currentPlan?.properties?.is_free === true ||
			!billingContext?.hasActiveSubscription;

		const getFeature = (id: FeatureId | string): CustomerFeature | null =>
			customer?.features?.[id] ?? null;

		const canUse = (id: FeatureId | string): boolean => {
			const feature = customer?.features?.[id];
			if (!feature) return false;
			if (feature.unlimited) return true;
			return (feature.balance ?? 0) > 0;
		};

		const getUsage = (id: FeatureId | string): FeatureAccess => {
			const feature = customer?.features?.[id];
			if (!feature) {
				return {
					allowed: false,
					balance: 0,
					limit: 0,
					unlimited: false,
					usagePercent: null,
				};
			}

			const balance = feature.balance ?? 0;
			const limit = feature.included_usage ?? 0;
			const unlimited = feature.unlimited ?? false;
			const usagePercent =
				!unlimited && limit > 0
					? Math.round(((limit - balance) / limit) * 100)
					: null;

			return {
				allowed: unlimited || balance > 0,
				balance,
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
			if (typeof refetchProducts === "function") refetchProducts();
		};

		return {
			customer: customer ?? null,
			products: products ?? [],
			isLoading: isCustomerLoading || isProductsLoading || isBillingContextLoading,
			hasActiveSubscription: billingContext?.hasActiveSubscription ?? false,
			currentPlanId,
			isFree,
			isOrganizationBilling,
			canUserUpgrade,
			canUse,
			getUsage,
			getFeature,
			isFeatureEnabled,
			getGatedFeatureAccess,
			getUpgradeMessage,
			isAiCapabilityEnabled,
			getPlanCapabilities,
			refetch,
		};
	}, [
		customer,
		products,
		billingContext,
		isCustomerLoading,
		isProductsLoading,
		isBillingContextLoading,
		refetchCustomer,
		refetchBillingContext,
		refetchProducts,
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
	const {
		isAiCapabilityEnabled,
		currentPlanId,
		isFree,
		canUserUpgrade,
	} = useBillingContext();
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

export {
	AI_CAPABILITIES,
	type AiCapabilityId,
	FEATURE_IDS,
	FEATURE_METADATA,
	GATED_FEATURES,
	PLAN_CAPABILITIES,
	type PlanCapabilities,
	PLAN_IDS,
	type FeatureId,
	type GatedFeatureId,
	type PlanId,
};

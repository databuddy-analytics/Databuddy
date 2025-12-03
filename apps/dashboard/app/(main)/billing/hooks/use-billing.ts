import type { CustomerProduct } from "autumn-js";
import { useCustomer, usePricingTable } from "autumn-js/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AttachDialog from "@/components/autumn/attach-dialog";
import {
	calculateFeatureUsage,
	type FeatureUsage,
	type PricingTier,
} from "../utils/feature-usage";

export type Usage = { features: FeatureUsage[] };
export type CancelTarget = {
	id: string;
	name: string;
	currentPeriodEnd?: number;
};

export type { Customer, CustomerInvoice as Invoice } from "autumn-js";
export type { CustomerWithPaymentMethod } from "../types/billing";

export function useBilling(refetch?: () => void) {
	const { attach, cancel, check, track, openBillingPortal } = useCustomer();
	const [isLoading, setIsLoading] = useState(false);
	const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

	const handleUpgrade = async (planId: string) => {
		try {
			await attach({
				productId: planId,
				dialog: AttachDialog,
				successUrl: `${window.location.origin}/billing`,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "An unexpected error occurred."
			);
		}
	};

	const handleCancel = async (planId: string, immediate = false) => {
		setIsLoading(true);
		try {
			await cancel({
				productId: planId,
				...(immediate && { cancelImmediately: true }),
			});
			toast.success(
				immediate
					? "Subscription cancelled immediately."
					: "Subscription cancelled."
			);
			if (refetch) {
				setTimeout(refetch, 500);
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to cancel subscription."
			);
		} finally {
			setIsLoading(false);
		}
	};

	const getSubscriptionStatusDetails = (product: CustomerProduct) => {
		if (product.canceled_at && product.current_period_end) {
			return `Access until ${dayjs(product.current_period_end).format("MMM D, YYYY")}`;
		}
		if (product.status === "scheduled") {
			return `Starts on ${dayjs(product.started_at).format("MMM D, YYYY")}`;
		}
		if (product.current_period_end) {
			return `Renews on ${dayjs(product.current_period_end).format("MMM D, YYYY")}`;
		}
		return "";
	};

	return {
		isLoading,
		onUpgrade: handleUpgrade,
		onCancel: handleCancel,
		onCancelClick: (id: string, name: string, currentPeriodEnd?: number) =>
			setCancelTarget({ id, name, currentPeriodEnd }),
		onCancelConfirm: async (immediate: boolean) => {
			if (!cancelTarget) {
				return;
			}
			await handleCancel(cancelTarget.id, immediate);
			setCancelTarget(null);
		},
		onCancelDialogClose: () => setCancelTarget(null),
		onManageBilling: () =>
			openBillingPortal({ returnUrl: `${window.location.origin}/billing` }),
		check,
		track,
		showCancelDialog: !!cancelTarget,
		cancelTarget,
		getSubscriptionStatusDetails,
	};
}

export function useBillingData() {
	const {
		customer,
		isLoading: isCustomerLoading,
		error: customerError,
		refetch: refetchCustomer,
	} = useCustomer({ expand: ["invoices", "payment_method"] });

	const {
		products,
		isLoading: isPricingLoading,
		refetch: refetchPricing,
	} = usePricingTable();

	const featureConfig = useMemo(() => {
		const limits: Record<string, number> = {};
		const tiers: Record<string, PricingTier[]> = {};

		const activeProduct = customer?.products?.find(
			(p) =>
				p.status === "active" ||
				(p.canceled_at && dayjs(p.current_period_end).isAfter(dayjs()))
		);

		for (const item of activeProduct?.items ?? []) {
			if (item.feature_id) {
				if (typeof item.included_usage === "number") {
					limits[item.feature_id] = item.included_usage;
				}
				// Tiers exist on priced_feature items but aren't in the type
				const itemTiers = (item as { tiers?: PricingTier[] }).tiers;
				if (Array.isArray(itemTiers)) {
					tiers[item.feature_id] = itemTiers;
				}
			}
		}

		return { limits, tiers };
	}, [customer?.products]);

	const usage: Usage = {
		features: customer?.features
			? Object.values(customer.features).map((f) =>
					calculateFeatureUsage(
						f,
						featureConfig.limits[f.id],
						featureConfig.tiers[f.id]
					)
				)
			: [],
	};

	const refetch = () => {
		refetchCustomer();
		if (typeof refetchPricing === "function") {
			refetchPricing();
		}
	};

	return {
		products: products ?? [],
		usage,
		customer,
		customerData: customer,
		isLoading: isCustomerLoading || isPricingLoading,
		error: customerError,
		refetch,
	};
}

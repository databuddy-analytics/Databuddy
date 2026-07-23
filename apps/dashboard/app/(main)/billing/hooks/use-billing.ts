import { useCustomer, useListPlans } from "autumn-js/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { dayjs } from "@databuddy/ui";
import { trackCancelFeedbackAction } from "../actions/cancel-feedback-action";
import type { CancelFeedback } from "../components/cancel-subscription-dialog";
import {
	calculateFeatureUsage,
	type FeatureUsage,
} from "../utils/feature-usage";
import { getStripeMetadata } from "../utils/stripe-metadata";

export interface Usage {
	features: FeatureUsage[];
}
export interface CancelTarget {
	currentPeriodEnd?: number;
	id: string;
	name: string;
}

export type { Customer, Invoice } from "autumn-js";
export type { CancelFeedback } from "../components/cancel-subscription-dialog";
export type { CustomerWithPaymentMethod } from "../types/billing";

export function useBilling(refetch?: () => void) {
	const { attach, updateSubscription, check, openCustomerPortal } =
		useCustomer();
	const [isLoading, setIsLoading] = useState(false);
	const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

	const handleUpgrade = async (planId: string) => {
		try {
			await attach({
				planId,
				successUrl: `${window.location.origin}/billing`,
				metadata: getStripeMetadata(),
			});
		} catch (error) {
			toast.error(
				getUserFacingErrorMessage(
					error,
					"We couldn't update this subscription. Try again."
				)
			);
		}
	};

	const handleCancel = async (planId: string, immediate = false) => {
		setIsLoading(true);
		try {
			await updateSubscription({
				planId,
				cancelAction: immediate ? "cancel_immediately" : "cancel_end_of_cycle",
			});
			toast.success(
				immediate
					? "Subscription canceled immediately."
					: "Subscription cancellation scheduled."
			);
			if (refetch) {
				setTimeout(refetch, 500);
			}
			return true;
		} catch (error) {
			toast.error(
				getUserFacingErrorMessage(
					error,
					"We couldn't cancel the subscription. Try again."
				)
			);
			return false;
		} finally {
			setIsLoading(false);
		}
	};

	const getSubscriptionStatusDetails = (sub: {
		canceledAt?: number | null;
		currentPeriodEnd?: number | null;
		status?: string;
		startedAt?: number | null;
	}) => {
		if (sub.canceledAt && sub.currentPeriodEnd) {
			return `Access until ${dayjs(sub.currentPeriodEnd).format("MMM D, YYYY")}`;
		}
		if (sub.status === "scheduled") {
			return `Starts on ${dayjs(sub.startedAt).format("MMM D, YYYY")}`;
		}
		if (sub.currentPeriodEnd) {
			return `Renews on ${dayjs(sub.currentPeriodEnd).format("MMM D, YYYY")}`;
		}
		return "";
	};

	return {
		isLoading,
		onUpgrade: handleUpgrade,
		onCancel: handleCancel,
		onCancelClick: (id: string, name: string, currentPeriodEnd?: number) =>
			setCancelTarget({ id, name, currentPeriodEnd }),
		onCancelConfirm: async (immediate: boolean, feedback?: CancelFeedback) => {
			if (!cancelTarget) {
				return false;
			}
			const didCancel = await handleCancel(cancelTarget.id, immediate);
			if (!didCancel) {
				return false;
			}
			if (feedback) {
				trackCancelFeedbackAction({
					feedback,
					planId: cancelTarget.id,
					planName: cancelTarget.name,
					immediate,
				});
			}
			setCancelTarget(null);
			return true;
		},
		onCancelDialogClose: () => setCancelTarget(null),
		onManageBilling: () =>
			openCustomerPortal({
				returnUrl: `${window.location.origin}/billing`,
			}),
		check,
		showCancelDialog: !!cancelTarget,
		cancelTarget,
		getSubscriptionStatusDetails,
	};
}

export function useBillingData() {
	const {
		data: customer,
		isLoading: isCustomerLoading,
		error: customerError,
		refetch: refetchCustomer,
	} = useCustomer({ expand: ["invoices", "payment_method"] });

	const {
		data: plans,
		isLoading: isPlansLoading,
		refetch: refetchPlans,
	} = useListPlans();

	const usage: Usage = useMemo(
		() => ({
			features: customer?.balances
				? Object.values(customer.balances).map((bal) =>
						calculateFeatureUsage(bal)
					)
				: [],
		}),
		[customer?.balances]
	);

	const refetch = () => {
		refetchCustomer();
		refetchPlans();
	};

	return {
		plans: plans ?? [],
		usage,
		customer,
		customerData: customer,
		isLoading: isCustomerLoading || isPlansLoading,
		error: customerError,
		refetch,
	};
}

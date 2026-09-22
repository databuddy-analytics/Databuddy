import { useCustomer, useListPlans } from "autumn-js/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { dayjs } from "@databuddy/ui";
import { trackCancelFeedbackAction } from "../actions/cancel-feedback-action";
import type { CancelFeedback } from "../components/cancel-subscription-dialog";
import {
	calculateFeatureUsage,
	findPlanPricingTiers,
} from "../utils/feature-usage";
export interface CancelTarget {
	currentPeriodEnd?: number;
	id: string;
	name: string;
}
export type { CancelFeedback } from "../components/cancel-subscription-dialog";

export function useBilling(refetch?: () => void) {
	const { updateSubscription, openCustomerPortal } = useCustomer();
	const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

	const handleCancel = async (planId: string, immediate = false) => {
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
	} = useCustomer({
		expand: ["invoices", "payment_method", "subscriptions.plan"],
	});

	const {
		data: plans,
		isLoading: isPlansLoading,
		refetch: refetchPlans,
	} = useListPlans();

	const usage = useMemo(
		() => ({
			features: customer?.balances
				? Object.values(customer.balances).map((bal) =>
						calculateFeatureUsage(
							bal,
							findPlanPricingTiers(plans, bal.featureId)
						)
					)
				: [],
		}),
		[customer?.balances, plans]
	);

	const refetch = () => {
		refetchCustomer();
		refetchPlans();
	};

	return {
		plans: plans ?? [],
		usage,
		customer,
		isLoading: isCustomerLoading || isPlansLoading,
		error: customerError,
		refetch,
	};
}

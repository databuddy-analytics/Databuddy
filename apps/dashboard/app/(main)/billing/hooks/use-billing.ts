import type { Customer, CustomerProduct } from 'autumn-js';
import { useAutumn, useCustomer, usePricingTable } from 'autumn-js/react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { toast } from 'sonner';
import AttachDialog from '@/components/autumn/attach-dialog';

export type FeatureUsage = {
	id: string;
	name: string;
	used: number;
	limit: number;
	unlimited: boolean;
	nextReset: string | null;
	interval: string | null;
};

export type Usage = {
	features: FeatureUsage[];
};

// Re-export types for compatibility
export type { Customer, CustomerInvoice as Invoice } from 'autumn-js';

export function useBilling(refetch?: () => void) {
	const { attach, cancel, check, track, openBillingPortal } = useAutumn();
	const [isLoading, setIsLoading] = useState(false);
	const [showNoPaymentDialog, setShowNoPaymentDialog] = useState(false);
	const [showCancelDialog, setShowCancelDialog] = useState(false);
	const [cancellingPlan, setCancellingPlan] = useState<{
		id: string;
		name: string;
		currentPeriodEnd?: number;
	} | null>(null);
	const [_isActionLoading, setIsActionLoading] = useState(false);

	const handleUpgrade = async (planId: string) => {
		setIsActionLoading(true);

		try {
			const _result = await attach({
				productId: planId,
				dialog: AttachDialog,
				successUrl: `${window.location.origin}/billing`,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'An unexpected error occurred.';
			toast.error(message);
		} finally {
			setIsActionLoading(false);
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
					? 'Subscription cancelled immediately.'
					: 'Subscription cancelled.'
			);
			if (refetch) {
				setTimeout(() => refetch(), 500);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to cancel subscription.';
			toast.error(message);
		} finally {
			setIsLoading(false);
		}
	};

	const handleCancelClick = (
		planId: string,
		planName: string,
		currentPeriodEnd?: number
	) => {
		setCancellingPlan({ id: planId, name: planName, currentPeriodEnd });
		setShowCancelDialog(true);
	};

	const handleCancelConfirm = async (immediate: boolean) => {
		if (!cancellingPlan) {
			return;
		}
		await handleCancel(cancellingPlan.id, immediate);
		setCancellingPlan(null);
	};

	const handleManageBilling = async () => {
		await openBillingPortal({
			returnUrl: `${window.location.origin}/billing`,
		});
	};

	const getSubscriptionStatus = (product: CustomerProduct) => {
		if (product.canceled_at) {
			return 'Cancelling';
		}
		if (product.status === 'scheduled') {
			return 'Scheduled';
		}
		return 'Active';
	};

	const getSubscriptionStatusDetails = (product: CustomerProduct) => {
		if (product.canceled_at && product.current_period_end) {
			return `Access until ${dayjs(product.current_period_end).format('MMM D, YYYY')}`;
		}
		if (product.status === 'scheduled') {
			return `Starts on ${dayjs(product.started_at).format('MMM D, YYYY')}`;
		}
		if (product.current_period_end) {
			return `Renews on ${dayjs(product.current_period_end).format('MMM D, YYYY')}`;
		}
		return '';
	};

	const getFeatureUsage = (featureId: string, customer?: Customer) => {
		if (!customer?.features) {
			return null;
		}

		const feature = customer.features[featureId];
		if (!feature) {
			return null;
		}

		const includedUsage = feature.included_usage || 0;
		const balance = feature.balance || 0;
		const reportedUsage = feature.usage || 0;

		// Handle special cases: infinity values or unlimited features
		const isUnlimited =
			feature.unlimited ||
			!Number.isFinite(balance) ||
			!Number.isFinite(reportedUsage) ||
			balance >= Number.MAX_SAFE_INTEGER;

		let actualUsed = 0;
		if (!isUnlimited) {
			// Calculate used amount: included_usage - balance
			// If usage field exists and is positive, use that instead
			const calculatedUsed = Math.max(0, includedUsage - balance);
			const positiveReportedUsage = Math.max(0, reportedUsage);
			actualUsed = Math.max(calculatedUsed, positiveReportedUsage);
		}

		return {
			id: feature.id,
			name: feature.name,
			used: actualUsed,
			limit: isUnlimited ? Number.POSITIVE_INFINITY : includedUsage,
			unlimited: isUnlimited,
			nextReset: feature.next_reset_at
				? dayjs(feature.next_reset_at).format('MMM D, YYYY')
				: null,
			interval: feature.interval || null,
		};
	};

	return {
		isLoading,
		onUpgrade: handleUpgrade,
		onCancel: handleCancel,
		onCancelClick: handleCancelClick,
		onCancelConfirm: handleCancelConfirm,
		onManageBilling: handleManageBilling,
		check,
		track,
		showNoPaymentDialog,
		setShowNoPaymentDialog,
		showCancelDialog,
		setShowCancelDialog,
		cancellingPlan,
		getSubscriptionStatus,
		getSubscriptionStatusDetails,
		getFeatureUsage,
	};
}

// Consolidated billing data hook
export function useBillingData() {
	const {
		customer,
		isLoading: isCustomerLoading,
		refetch: refetchCustomer,
	} = useCustomer({
		expand: ['invoices'],
		swrConfig: {
			revalidateOnFocus: false,
			revalidateOnMount: true,
			dedupingInterval: 5 * 60 * 1000, // 5 minutes
		},
	});

	const {
		products,
		isLoading: isPricingLoading,
		refetch: refetchPricing,
	} = usePricingTable();

	const isLoading = isCustomerLoading || isPricingLoading;

	const refetch = () => {
		refetchCustomer();
		if (typeof refetchPricing === 'function') {
			refetchPricing();
		}
	};

	const usage: Usage = {
		features: customer
			? Object.values(customer.features).map((feature) => {
					const includedUsage = feature.included_usage || 0;
					const balance = feature.balance || 0;
					const reportedUsage = feature.usage || 0;

					// Handle special cases: infinity values or unlimited features
					const isUnlimited =
						feature.unlimited ||
						!Number.isFinite(balance) ||
						!Number.isFinite(reportedUsage) ||
						balance >= Number.MAX_SAFE_INTEGER;

					let actualUsed = 0;
					if (!isUnlimited) {
						// Calculate used amount: included_usage - balance
						// If usage field exists and is positive, use that instead
						const calculatedUsed = Math.max(0, includedUsage - balance);
						const positiveReportedUsage = Math.max(0, reportedUsage);
						actualUsed = Math.max(calculatedUsed, positiveReportedUsage);
					}

					return {
						id: feature.id,
						name: feature.name,
						used: actualUsed,
						limit: isUnlimited ? Number.POSITIVE_INFINITY : includedUsage,
						unlimited: isUnlimited,
						nextReset: feature.next_reset_at
							? new Date(feature.next_reset_at).toLocaleDateString()
							: null,
						interval: feature.interval || null,
					};
				})
			: [],
	};

	return {
		products: products || [],
		usage,
		customer,
		customerData: customer, // Alias for backward compatibility
		isLoading,
		refetch,
	};
}
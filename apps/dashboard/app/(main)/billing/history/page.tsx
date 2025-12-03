"use client";

import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	ClockIcon,
	FileTextIcon,
	ReceiptIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import type { CustomerInvoice } from "autumn-js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { memo, useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ErrorState } from "../components/empty-states";
import { useBilling, useBillingData } from "../hooks/use-billing";

dayjs.extend(relativeTime);

export default function HistoryPage() {
	const { customerData, isLoading, error, refetch } = useBillingData();
	const { onManageBilling } = useBilling();

	const invoices = customerData?.invoices ?? [];
	const sortedInvoices = useMemo(
		() => [...invoices].sort((a, b) => b.created_at - a.created_at),
		[invoices]
	);

	const subscriptionHistory = useMemo(() => {
		if (!customerData?.products?.length) {
			return [];
		}
		return customerData.products;
	}, [customerData?.products]);

	if (isLoading) {
		return (
			<main className="min-h-0 flex-1 overflow-hidden">
				<HistorySkeleton />
			</main>
		);
	}

	if (error) {
		return (
			<main className="min-h-0 flex-1 overflow-hidden">
				<ErrorState error={error} onRetry={refetch} />
			</main>
		);
	}

	return (
		<main className="min-h-0 flex-1 overflow-hidden">
			<div className="flex h-full flex-col overflow-y-auto lg:grid lg:h-full lg:grid-cols-[1fr_20rem] lg:overflow-hidden">
				{/* Main Content - Invoices */}
				<div className="shrink-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
					{sortedInvoices.length === 0 ? (
						<EmptyState
							className="h-full"
							description="Invoices will appear here after your first payment"
							icon={<ReceiptIcon />}
							title="No invoices yet"
							variant="minimal"
						/>
					) : (
						<div className="divide-y">
							{sortedInvoices.map((invoice) => (
								<InvoiceRow invoice={invoice} key={invoice.stripe_id} />
							))}
						</div>
					)}
				</div>

				{/* Sidebar - Subscription History + Actions */}
				<RightSidebar>
					{/* Subscription Changes */}
					<div className="border-b p-5">
						<h3 className="font-semibold">Subscription History</h3>
						{subscriptionHistory.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No subscription history yet
							</p>
						) : (
							<div className="space-y-3">
								{subscriptionHistory.map((product) => (
									<SubscriptionItem key={product.id} product={product} />
								))}
							</div>
						)}
					</div>

					{/* Billing Summary */}
					<div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-0 lg:p-0">
						<div className="w-full lg:w-auto lg:border-b lg:p-5">
							<h3 className="mb-3 font-semibold">Billing Summary</h3>
							<BillingSummary invoices={sortedInvoices} />
						</div>

						{/* Actions */}
						<div className="flex w-full flex-col gap-2 lg:w-auto lg:p-5">
							<Button className="w-full" onClick={onManageBilling}>
								Billing Portal
								<ArrowSquareOutIcon size={14} />
							</Button>
						</div>
					</div>
				</RightSidebar>
			</div>
		</main>
	);
}

const InvoiceRow = memo(function InvoiceRowComponent({
	invoice,
}: {
	invoice: CustomerInvoice;
}) {
	const status = getInvoiceStatus(invoice.status);
	const formattedDate = dayjs(invoice.created_at).format("MMM D, YYYY");
	const amount = formatCurrency(invoice.total, invoice.currency);

	return (
		<div className="px-5 py-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div
						className={cn(
							"flex h-10 w-10 shrink-0 items-center justify-center rounded border",
							status.variant === "green"
								? "border-green-600 bg-green-100 dark:border-green-800 dark:bg-green-900/30"
								: status.variant === "amber"
									? "border-amber-600 bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30"
									: status.variant === "destructive"
										? "border-destructive bg-destructive-100 dark:border-destructive-800 dark:bg-destructive-900/30"
										: "border-muted-foreground bg-muted dark:border-muted-foreground dark:bg-muted/30"
						)}
					>
						<status.icon
							className={cn(
								status.variant === "green"
									? "text-green-600 dark:text-green-600"
									: status.variant === "amber"
										? "text-amber-600 dark:text-amber-400"
										: status.variant === "destructive"
											? "text-destructive dark:text-destructive-400"
											: "text-muted-foreground dark:text-muted-foreground/80"
							)}
							size={18}
							weight="duotone"
						/>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="font-medium">
								Invoice #{invoice.stripe_id.slice(-8)}
							</span>
							<Badge variant={status.variant}>{status.label}</Badge>
						</div>
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<span>{formattedDate}</span>
							<span>·</span>
							<span className="font-medium text-foreground">{amount}</span>
						</div>
					</div>
				</div>

				{invoice.hosted_invoice_url && (
					<Button
						aria-label="View invoice"
						className="shrink-0"
						onClick={() => window.open(invoice.hosted_invoice_url, "_blank")}
						size="sm"
						variant="secondary"
					>
						<FileTextIcon size={14} weight="duotone" />
						View
					</Button>
				)}
			</div>
		</div>
	);
});

type ProductStatus = {
	id: string;
	name?: string | null;
	status?: string;
	started_at?: number | null;
	current_period_end?: number | null;
	canceled_at?: number | null;
};

function SubscriptionItem({ product }: { product: ProductStatus }) {
	const renewalDate = product.current_period_end
		? dayjs(product.current_period_end)
		: null;
	const isCanceled = !!product.canceled_at;
	const isActive = product.status === "active";

	return (
		<div className="flex items-start gap-3">
			<div
				className={cn(
					"mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
					isActive ? "bg-primary/10" : "bg-muted"
				)}
			>
				{isActive ? (
					<CheckCircleIcon className="text-primary" size={14} weight="fill" />
				) : (
					<ClockIcon className="text-muted-foreground" size={14} />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">
						{product.name || product.id}
					</span>
					{isActive && (
						<Badge className="bg-primary/10 text-primary" variant="secondary">
							Active
						</Badge>
					)}
				</div>
				<div className="text-muted-foreground text-xs">
					{product.started_at && (
						<span>Started {dayjs(product.started_at).fromNow()}</span>
					)}
					{renewalDate && (
						<span className="ml-2">
							· {isCanceled ? "Ends" : "Renews"} {renewalDate.fromNow()}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function BillingSummary({ invoices }: { invoices: CustomerInvoice[] }) {
	const stats = useMemo(() => {
		const paid = invoices.filter((i) => i.status === "paid");
		const totalPaid = paid.reduce((sum, i) => sum + i.total, 0);
		const currency = invoices[0]?.currency || "usd";

		return {
			totalInvoices: invoices.length,
			paidInvoices: paid.length,
			totalSpent: formatCurrency(totalPaid, currency),
			lastPayment: paid[0]
				? dayjs(paid[0].created_at).format("MMM D, YYYY")
				: "N/A",
		};
	}, [invoices]);

	if (invoices.length === 0) {
		return (
			<div className="flex aspect-[1.586/1] w-full flex-col items-center justify-center rounded-xl border border-dashed bg-background">
				<ReceiptIcon
					className="mb-2 text-muted-foreground"
					size={28}
					weight="duotone"
				/>
				<span className="text-muted-foreground text-sm">
					No billing history
				</span>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between rounded border bg-background px-3 py-2">
				<span className="text-muted-foreground text-sm">Total Spent</span>
				<span className="font-semibold">{stats.totalSpent}</span>
			</div>
			<div className="flex items-center justify-between rounded border bg-background px-3 py-2">
				<span className="text-muted-foreground text-sm">Invoices</span>
				<span className="font-medium">
					{stats.paidInvoices} / {stats.totalInvoices}
				</span>
			</div>
			<div className="flex items-center justify-between rounded border bg-background px-3 py-2">
				<span className="text-muted-foreground text-sm">Last Payment</span>
				<span className="font-medium">{stats.lastPayment}</span>
			</div>
		</div>
	);
}

function HistorySkeleton() {
	return (
		<div className="flex h-full flex-col overflow-y-auto lg:grid lg:grid-cols-[1fr_20rem] lg:overflow-hidden">
			<div className="shrink-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
				<div className="border-b px-5 py-4">
					<Skeleton className="mb-1 h-5 w-20" />
					<Skeleton className="h-4 w-48" />
				</div>
				<div className="divide-y">
					{[1, 2, 3].map((i) => (
						<div className="px-5 py-4" key={i}>
							<div className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 rounded" />
								<div>
									<Skeleton className="mb-1 h-4 w-32" />
									<Skeleton className="h-3 w-24" />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
			<div className="flex w-full shrink-0 flex-col border-t bg-card lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l">
				<div className="border-b p-5">
					<Skeleton className="mb-3 h-5 w-36" />
					<div className="space-y-3">
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
					</div>
				</div>
				<div className="p-5">
					<Skeleton className="mb-3 h-5 w-28" />
					<div className="space-y-2">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}

function getInvoiceStatus(status: string) {
	switch (status) {
		case "paid":
			return {
				label: "Paid",
				icon: CheckCircleIcon,
				variant: "green" as const,
			};
		case "open":
		case "pending":
			return { label: "Pending", icon: ClockIcon, variant: "amber" as const };
		case "failed":
			return {
				label: "Failed",
				icon: XCircleIcon,
				variant: "destructive" as const,
			};
		default:
			return {
				label: status,
				icon: FileTextIcon,
				variant: "secondary" as const,
			};
	}
}

function formatCurrency(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
}

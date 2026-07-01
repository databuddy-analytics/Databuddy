"use client";

import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ErrorState } from "../components/empty-states";
import { useBilling, useBillingData } from "../hooks/use-billing";
import {
	ArrowSquareOutIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CheckCircleIcon,
	ClockIcon,
	FileTextIcon,
	ReceiptIcon,
	XCircleIcon,
} from "@databuddy/ui/icons";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Skeleton,
	Text,
	dayjs,
} from "@databuddy/ui";

const PAGE_SIZE = 10;

export default function HistoryPage() {
	const { customerData, isLoading, error, refetch } = useBillingData();
	const { onManageBilling } = useBilling();
	const [page, setPage] = useState(0);

	const invoices = customerData?.invoices ?? [];
	const sortedInvoices = useMemo(
		() => [...invoices].sort((a, b) => b.createdAt - a.createdAt),
		[invoices]
	);

	const totalPages = Math.ceil(sortedInvoices.length / PAGE_SIZE);
	const paginatedInvoices = sortedInvoices.slice(
		page * PAGE_SIZE,
		(page + 1) * PAGE_SIZE
	);

	const subscriptionHistory = useMemo(() => {
		if (!customerData?.subscriptions?.length) {
			return [];
		}
		return customerData.subscriptions;
	}, [customerData?.subscriptions]);

	if (isLoading) {
		return (
			<main className="min-h-0 flex-1 overflow-y-auto">
				<HistorySkeleton />
			</main>
		);
	}

	if (error) {
		return (
			<main className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl p-5">
					<ErrorState error={error} onRetry={refetch} />
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-5">
				<Card>
					<Card.Header className="flex-row items-start justify-between gap-4">
						<div>
							<Card.Title>Invoices</Card.Title>
							<Card.Description>
								{sortedInvoices.length === 0
									? "Invoices will appear here after your first payment"
									: `${sortedInvoices.length} invoice${sortedInvoices.length === 1 ? "" : "s"}`}
							</Card.Description>
						</div>
						<Button onClick={onManageBilling} size="sm" variant="secondary">
							<ArrowSquareOutIcon size={14} />
							Billing Portal
						</Button>
					</Card.Header>
					<Card.Content className="p-0">
						{sortedInvoices.length === 0 ? (
							<div className="px-5 py-8">
								<EmptyState
									icon={<ReceiptIcon weight="duotone" />}
									title="No invoices yet"
								/>
							</div>
						) : (
							<>
								<div className="divide-y">
									{paginatedInvoices.map((invoice) => (
										<InvoiceRow invoice={invoice} key={invoice.stripeId} />
									))}
								</div>
								{totalPages > 1 && (
									<div className="flex items-center justify-between border-t px-5 py-3">
										<Text tone="muted" variant="caption">
											{page * PAGE_SIZE + 1}–
											{Math.min((page + 1) * PAGE_SIZE, sortedInvoices.length)}{" "}
											of {sortedInvoices.length}
										</Text>
										<div className="flex items-center gap-1">
											<Button
												aria-label="Previous page"
												disabled={page === 0}
												onClick={() => setPage((p) => p - 1)}
												size="sm"
												variant="ghost"
											>
												<CaretLeftIcon size={14} />
											</Button>
											<Button
												aria-label="Next page"
												disabled={page >= totalPages - 1}
												onClick={() => setPage((p) => p + 1)}
												size="sm"
												variant="ghost"
											>
												<CaretRightIcon size={14} />
											</Button>
										</div>
									</div>
								)}
							</>
						)}
					</Card.Content>
				</Card>

				{subscriptionHistory.length > 0 && (
					<Card>
						<Card.Header>
							<Card.Title>Subscription History</Card.Title>
							<Card.Description>
								{subscriptionHistory.length} subscription
								{subscriptionHistory.length === 1 ? "" : "s"}
							</Card.Description>
						</Card.Header>
						<Card.Content className="p-0">
							<div className="divide-y">
								{subscriptionHistory.map((sub) => (
									<SubscriptionItem key={sub.id} sub={sub} />
								))}
							</div>
						</Card.Content>
					</Card>
				)}
			</div>
		</main>
	);
}

type Invoice = NonNullable<
	NonNullable<ReturnType<typeof useBillingData>["customerData"]>["invoices"]
>[number];

const InvoiceRow = memo(function InvoiceRowComponent({
	invoice,
}: {
	invoice: Invoice;
}) {
	const status = getInvoiceStatus(invoice.status);
	const formattedDate = dayjs(invoice.createdAt).format("MMM D, YYYY");
	const amount = formatCurrency(invoice.total, invoice.currency);

	return (
		<div className="flex items-center justify-between gap-3 px-5 py-3">
			<div className="flex min-w-0 items-center gap-3">
				<div
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded border",
						status.variant === "success"
							? "border-green-600/30 bg-green-500/10 dark:border-green-800 dark:bg-green-900/30"
							: status.variant === "warning"
								? "border-amber-600/30 bg-amber-500/10 dark:border-amber-800 dark:bg-amber-900/30"
								: status.variant === "destructive"
									? "border-red-600/30 bg-red-500/10 dark:border-red-800 dark:bg-red-900/30"
									: "border-border bg-secondary"
					)}
				>
					<status.icon
						className={cn(
							"size-3.5",
							status.variant === "success"
								? "text-green-600 dark:text-green-400"
								: status.variant === "warning"
									? "text-amber-600 dark:text-amber-400"
									: status.variant === "destructive"
										? "text-red-600 dark:text-red-400"
										: "text-muted-foreground"
						)}
						weight="duotone"
					/>
				</div>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<Text className="truncate" variant="label">
							{formattedDate}
						</Text>
						<Badge variant={status.variant}>{status.label}</Badge>
					</div>
					<Text className="truncate" tone="muted" variant="caption">
						#{invoice.stripeId.slice(-8)}
					</Text>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-3">
				<Text className="tabular-nums" variant="label">
					{amount}
				</Text>
				{invoice.hostedInvoiceUrl && (
					<Button
						aria-label="View invoice"
						onClick={() =>
							window.open(invoice.hostedInvoiceUrl ?? "", "_blank")
						}
						size="sm"
						variant="ghost"
					>
						<FileTextIcon size={14} />
						View
					</Button>
				)}
			</div>
		</div>
	);
});

function SubscriptionItem({
	sub,
}: {
	sub: {
		id: string;
		planId: string;
		plan?: { name?: string } | null;
		canceledAt?: number | null;
		currentPeriodEnd?: number | null;
		status?: string;
		startedAt?: number | null;
	};
}) {
	const renewalDate = sub.currentPeriodEnd ? dayjs(sub.currentPeriodEnd) : null;
	const isCanceled = !!sub.canceledAt;
	const isActive = sub.status === "active";

	return (
		<div className="flex items-center gap-3 px-5 py-3">
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded border",
					isActive
						? "border-green-600/30 bg-green-500/10 dark:border-green-800 dark:bg-green-900/30"
						: "border-border bg-secondary"
				)}
			>
				{isActive ? (
					<CheckCircleIcon
						className="size-3.5 text-green-600 dark:text-green-400"
						weight="fill"
					/>
				) : (
					<ClockIcon className="size-3.5 text-muted-foreground" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<Text className="truncate" variant="label">
						{sub.plan?.name ?? sub.planId}
					</Text>
					{isActive && <Badge variant="success">Active</Badge>}
					{isCanceled && <Badge variant="muted">Cancelled</Badge>}
				</div>
				<Text tone="muted" variant="caption">
					Started {dayjs(sub.startedAt).fromNow()}
					{renewalDate && (
						<span>
							{" "}
							· {isCanceled ? "Ends" : "Renews"} {renewalDate.fromNow()}
						</span>
					)}
				</Text>
			</div>
		</div>
	);
}

function HistorySkeleton() {
	return (
		<div className="mx-auto max-w-2xl space-y-6 p-5">
			<Card>
				<Card.Header className="flex-row items-start justify-between gap-4">
					<div className="space-y-1">
						<Skeleton className="h-3.5 w-16" />
						<Skeleton className="h-3 w-24" />
					</div>
					<Skeleton className="h-7 w-28 rounded" />
				</Card.Header>
				<Card.Content className="p-0">
					<div className="divide-y">
						{[1, 2, 3, 4, 5].map((i) => (
							<div
								className="flex items-center justify-between gap-3 px-5 py-3"
								key={i}
							>
								<div className="flex items-center gap-3">
									<Skeleton className="size-8 rounded" />
									<div className="space-y-1">
										<Skeleton className="h-3.5 w-28" />
										<Skeleton className="h-3 w-20" />
									</div>
								</div>
								<Skeleton className="h-7 w-14 rounded" />
							</div>
						))}
					</div>
				</Card.Content>
			</Card>

			<Card>
				<Card.Header>
					<Skeleton className="h-3.5 w-36" />
					<Skeleton className="h-3 w-28" />
				</Card.Header>
				<Card.Content className="p-0">
					<div className="divide-y">
						{[1, 2].map((i) => (
							<div className="flex items-center gap-3 px-5 py-3" key={i}>
								<Skeleton className="size-8 rounded" />
								<div className="flex-1 space-y-1">
									<Skeleton className="h-3.5 w-28" />
									<Skeleton className="h-3 w-36" />
								</div>
							</div>
						))}
					</div>
				</Card.Content>
			</Card>
		</div>
	);
}

function getInvoiceStatus(status: string) {
	switch (status) {
		case "paid":
			return {
				label: "Paid",
				icon: CheckCircleIcon,
				variant: "success" as const,
			};
		case "open":
		case "pending":
			return { label: "Pending", icon: ClockIcon, variant: "warning" as const };
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
				variant: "default" as const,
			};
	}
}

function formatCurrency(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
}

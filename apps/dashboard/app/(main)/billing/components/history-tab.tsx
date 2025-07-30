'use client';

import {
	ArrowSquareOutIcon,
	CalendarIcon,
	CheckIcon,
	CreditCardIcon,
	FileTextIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useBilling } from '@/app/(main)/billing/hooks/use-billing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Customer, Invoice } from '../data/billing-data';

function InvoiceCard({ invoice }: { invoice: Invoice }) {
	const getStatusBadge = () => {
		switch (invoice.status) {
			case 'paid':
				return (
					<Badge className="bg-emerald-500 text-xs hover:bg-emerald-600">
						Paid
					</Badge>
				);
			case 'open':
			case 'pending':
				return (
					<Badge className="text-xs" variant="secondary">
						Pending
					</Badge>
				);
			case 'failed':
				return (
					<Badge className="text-xs" variant="destructive">
						Failed
					</Badge>
				);
			case 'draft':
				return (
					<Badge className="text-xs" variant="outline">
						Draft
					</Badge>
				);
			case 'void':
				return (
					<Badge className="text-xs" variant="outline">
						Void
					</Badge>
				);
			default:
				return null;
		}
	};

	const formatAmount = (amount: number, currency: string) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency.toUpperCase(),
		}).format(amount);
	};

	const getProductNames = (productIds: string[]) => {
		const productMap: Record<string, string> = {
			free: 'Free',
			pro: 'Pro',
			buddy: 'Buddy',
		};
		return productIds.map((id) => productMap[id] || id).join(', ');
	};

	return (
		<Card className="transition-shadow hover:shadow-sm">
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<div className="flex min-w-0 flex-1 items-center gap-3">
						<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border">
							<FileTextIcon className="text-muted-foreground" size={16} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="mb-1 flex items-center gap-2">
								<h4 className="font-medium text-sm">
									#{invoice.stripe_id.slice(-8)}
								</h4>
								{getStatusBadge()}
							</div>
							<div className="flex items-center gap-4 text-muted-foreground text-xs">
								<span>{dayjs(invoice.created_at).format('MMM D, YYYY')}</span>
								<span>{getProductNames(invoice.product_ids)}</span>
							</div>
						</div>
					</div>

					<div className="flex flex-shrink-0 items-center gap-3">
						<div className="text-right">
							<div className="font-semibold">
								{formatAmount(invoice.total, invoice.currency)}
							</div>
						</div>

						{invoice.hosted_invoice_url && (
							<Button
								className="h-8 cursor-pointer px-2"
								onClick={() => {
									if (invoice.hosted_invoice_url) {
										window.open(invoice.hosted_invoice_url, '_blank');
									}
								}}
								size="sm"
								variant="ghost"
							>
								<ArrowSquareOutIcon size={14} />
							</Button>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function SubscriptionHistoryCard({ customerData }: { customerData: any }) {
	if (!customerData?.products?.length) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					<CalendarIcon size={16} />
					Subscription History
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				<div className="space-y-3">
					{customerData.products.map((product: any) => (
						<div
							className="flex items-start gap-2 rounded border p-2 text-sm"
							key={product.id}
						>
							<div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
								<CheckIcon className="text-primary" size={10} />
							</div>
							<div className="min-w-0 flex-1">
								<div className="mb-1 flex items-center justify-between">
									<h4 className="truncate font-medium text-sm">
										{product.name || product.id}
									</h4>
									<Badge
										className="ml-2 text-xs"
										variant={
											product.status === 'active' ? 'default' : 'secondary'
										}
									>
										{product.status}
									</Badge>
								</div>
								<div className="text-muted-foreground text-xs">
									<div>
										Started: {dayjs(product.started_at).format('MMM D, YYYY')}
									</div>
									{product.current_period_end && (
										<div className="mt-0.5">
											{product.canceled_at ? 'Ends' : 'Renews'}:{' '}
											{dayjs(product.current_period_end).format('MMM D, YYYY')}
										</div>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

interface HistoryTabProps {
	invoices: Invoice[];
	customerData: Customer | null;
	isLoading: boolean;
}

export function HistoryTab({
	invoices,
	customerData,
	isLoading,
}: HistoryTabProps) {
	const { onManageBilling } = useBilling();

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="space-y-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-96" />
				</div>
				<div className="grid gap-6">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton className="h-48 w-full" key={i} />
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-xl">Billing History</h2>
					<p className="text-muted-foreground text-sm">
						View your invoices, payments, and subscription changes
					</p>
				</div>

				<Button
					className="cursor-pointer"
					onClick={onManageBilling}
					size="sm"
					variant="outline"
				>
					<CreditCardIcon className="mr-2" size={14} />
					Manage Billing
					<ArrowSquareOutIcon className="ml-1" size={12} />
				</Button>
			</div>

			<div className="grid gap-6 lg:grid-cols-4">
				<div className="space-y-4 lg:col-span-3">
					<div>
						<h3 className="mb-3 font-semibold text-lg">Recent Invoices</h3>

						{invoices.length ? (
							<div className="space-y-2">
								{invoices
									.sort((a: Invoice, b: Invoice) => b.created_at - a.created_at)
									.map((invoice: Invoice) => (
										<InvoiceCard invoice={invoice} key={invoice.stripe_id} />
									))}
							</div>
						) : (
							<Card>
								<CardContent className="flex flex-col items-center justify-center py-12">
									<div className="mb-4 flex h-12 w-12 items-center justify-center rounded border">
										<FileTextIcon className="text-muted-foreground" size={24} />
									</div>
									<h4 className="mb-2 font-semibold text-lg">
										No Invoices Yet
									</h4>
									<p className="max-w-sm text-center text-muted-foreground text-sm">
										Your invoices will appear here once you start using paid
										features.
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>

				<div className="lg:col-span-1">
					<SubscriptionHistoryCard customerData={customerData} />
				</div>
			</div>
		</div>
	);
}

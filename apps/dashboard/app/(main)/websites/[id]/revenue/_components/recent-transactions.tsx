'use client';

import { CalendarIcon, CreditCardIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/formatters';

interface Transaction {
	id: string;
	amount: number;
	currency: string;
	created: string;
	status: string;
}

interface RecentTransactionsProps {
	data: Transaction[];
	isLoading: boolean;
}

const TransactionSkeleton = () => (
	<div className="flex items-center justify-between rounded-lg border border-border/50 bg-gradient-to-r from-background to-muted/10 p-4">
		<div className="flex items-center gap-3">
			<Skeleton className="h-10 w-10 rounded-lg" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-24" />
			</div>
		</div>
		<div className="space-y-2 text-right">
			<Skeleton className="h-5 w-20" />
			<Skeleton className="h-4 w-16" />
		</div>
	</div>
);

export function RecentTransactions({
	data,
	isLoading,
}: RecentTransactionsProps) {
	if (isLoading) {
		return (
			<div className="space-y-3">
				{Array.from({ length: 5 }).map((_, i) => (
					<TransactionSkeleton key={i} />
				))}
			</div>
		);
	}

	if (!data.length) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<div className="relative">
						<CreditCardIcon className="mx-auto h-16 w-16 text-muted-foreground/20" />
						<div className="absolute inset-0 rounded-full bg-gradient-to-t from-primary/10 to-transparent blur-xl" />
					</div>
					<p className="mt-6 font-semibold text-foreground text-lg">
						No transactions yet
					</p>
					<p className="mx-auto mt-2 max-w-sm text-muted-foreground text-sm">
						Recent transactions will appear here as they are processed
					</p>
				</div>
			</div>
		);
	}

	const getStatusColor = (status: string) => {
		switch (status.toLowerCase()) {
			case 'succeeded':
				return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
			case 'failed':
				return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 border-gray-200 dark:border-gray-800';
		}
	};

	const formatDate = (dateString: string) => {
		try {
			return dayjs(new Date(dateString)).format('MMM dd, yyyy HH:mm');
		} catch {
			return dateString;
		}
	};

	return (
		<div className="space-y-3">
			{data.map((transaction) => (
				<div
					className="group flex items-center justify-between rounded-lg border border-border/50 bg-gradient-to-r from-background to-muted/10 p-4 transition-all duration-300 hover:border-primary/20 hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10"
					key={transaction.id}
				>
					<div className="flex items-center gap-3">
						<div className="rounded-lg border border-blue-200 bg-blue-100 p-2.5 transition-transform duration-300 group-hover:scale-110 dark:border-blue-800 dark:bg-blue-900/20">
							<CreditCardIcon
								className="text-blue-600 dark:text-blue-400"
								size={20}
								weight="duotone"
							/>
						</div>
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<p className="font-medium text-foreground text-sm">
									Transaction #{transaction.id.slice(-8)}
								</p>
								<Badge
									className={`border font-medium text-xs ${getStatusColor(transaction.status)}`}
									variant="outline"
								>
									{transaction.status.charAt(0).toUpperCase() +
										transaction.status.slice(1)}
								</Badge>
							</div>
							<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<CalendarIcon size={12} />
								<span>{formatDate(transaction.created)}</span>
							</div>
						</div>
					</div>
					<div className="text-right">
						<p className="font-bold text-foreground text-lg transition-colors group-hover:text-primary">
							{formatCurrency(transaction.amount)}
						</p>
						<p className="font-medium text-muted-foreground text-xs uppercase">
							{transaction.currency}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}

"use client";

import { publicConfig } from "@databuddy/env/public";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/analytics/stat-card";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useMediaQuery } from "@/hooks/use-media-query";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import { TopBar } from "@/components/layout/top-bar";
import { RevenueAttributionTables } from "./revenue-attribution-tables";
import { RevenueChart } from "./revenue-chart";
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CaretDownIcon,
	CheckCircleIcon,
	CheckIcon,
	ClipboardIcon,
	CreditCardIcon as StripeLogoIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	EyeIcon,
	EyeSlashIcon,
	GearIcon,
	LinkIcon,
	ReceiptIcon,
	SpinnerIcon,
	TrendUpIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import { Sheet } from "@databuddy/ui/client";
import { Button, Card, EmptyState, Input, dayjs } from "@databuddy/ui";

interface RevenueContentProps {
	websiteId: string;
}

interface RevenueOverview {
	attributed_revenue: number;
	attributed_transactions: number;
	refund_amount: number;
	refund_count: number;
	sale_count: number;
	sale_revenue: number;
	subscription_count: number;
	subscription_revenue: number;
	total_revenue: number;
	total_transactions: number;
	unique_customers: number;
}

interface RevenueTimeSeries {
	customers: number;
	date: string;
	refund_amount: number;
	refund_count: number;
	revenue: number;
	transactions: number;
}

const BASKET_URL = publicConfig.urls.basket;

const STRIPE_EVENTS = {
	required: ["payment_intent.succeeded", "charge.refunded"],
	optional: ["payment_intent.payment_failed", "payment_intent.canceled"],
};

const PADDLE_EVENTS = {
	required: ["transaction.completed"],
	optional: [],
};

function formatCurrency(amount: number, currency = "USD"): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

function padTimeSeriesData<T extends { date: string }>(
	data: T[],
	startDate: string,
	endDate: string,
	defaultValues: Omit<T, "date">
): T[] {
	if (data.length === 0) {
		return [];
	}

	const dataMap = new Map(data.map((d) => [d.date, d]));
	const result: T[] = [];
	let current = dayjs(startDate);
	const end = dayjs(endDate);

	while (current.isBefore(end) || current.isSame(end, "day")) {
		const dateStr = current.format("YYYY-MM-DD");
		const existing = dataMap.get(dateStr);

		if (existing) {
			result.push(existing);
		} else {
			result.push({ date: dateStr, ...defaultValues } as T);
		}

		current = current.add(1, "day");
	}

	return result;
}

type ExpandedSection = "webhooks" | "stripe" | "paddle" | null;

function CollapsibleSection({
	icon: Icon,
	title,
	badge,
	isExpanded,
	onToggleAction,
	children,
}: {
	icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
	title: string;
	badge?: React.ReactNode;
	isExpanded: boolean;
	onToggleAction: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="-mx-3">
				<button
					className="group flex w-full cursor-pointer items-center justify-between rounded px-3 py-3 text-left transition-colors hover:bg-accent/50"
					onClick={onToggleAction}
					type="button"
				>
					<div className="flex items-center gap-2.5">
						<Icon className="size-4" weight="duotone" />
						<span className="font-semibold text-sm">{title}</span>
						{badge}
					</div>
					<CaretDownIcon
						className={cn(
							"size-4 text-muted-foreground transition-transform duration-200",
							isExpanded && "rotate-180"
						)}
						weight="fill"
					/>
				</button>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						<div className="pb-4">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function RevenueSettingsSheet({
	websiteId,
	open,
	onOpenChangeAction,
}: {
	websiteId: string;
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [stripeSecret, setStripeSecret] = useState("");
	const [paddleSecret, setPaddleSecret] = useState("");
	const [showStripeSecret, setShowStripeSecret] = useState(false);
	const [showPaddleSecret, setShowPaddleSecret] = useState(false);
	const [expandedSection, setExpandedSection] =
		useState<ExpandedSection>("webhooks");
	const { isCopied: copiedStripeUrl, copyToClipboard: copyStripeUrl } =
		useCopyToClipboard({
			onCopy: () => toast.success("Webhook URL copied"),
		});
	const { isCopied: copiedPaddleUrl, copyToClipboard: copyPaddleUrl } =
		useCopyToClipboard({
			onCopy: () => toast.success("Webhook URL copied"),
		});

	const { data: config, isLoading } = useQuery({
		queryKey: ["revenue-config", websiteId],
		queryFn: () => orpc.revenue.get.call({ websiteId }),
	});

	const createWebhookMutation = useMutation({
		mutationFn: () => orpc.revenue.upsert.call({ websiteId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["revenue-config", websiteId],
			});
			toast.success("Webhook URLs generated");
		},
		onError: () => toast.error("Failed to generate webhook URL"),
	});

	const upsertMutation = useMutation({
		mutationFn: (data: {
			stripeWebhookSecret?: string;
			paddleWebhookSecret?: string;
		}) => orpc.revenue.upsert.call({ websiteId, ...data }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["revenue-config", websiteId],
			});
			setStripeSecret("");
			setPaddleSecret("");
			toast.success("Configuration saved");
		},
		onError: () => toast.error("Failed to save"),
	});

	const regenerateMutation = useMutation({
		mutationFn: () => orpc.revenue.regenerateHash.call({ websiteId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["revenue-config", websiteId],
			});
			toast.success("Webhook URLs regenerated");
		},
		onError: () => toast.error("Failed to regenerate"),
	});

	const handleSave = () => {
		const updates: {
			stripeWebhookSecret?: string;
			paddleWebhookSecret?: string;
		} = {};
		if (stripeSecret) {
			updates.stripeWebhookSecret = stripeSecret;
		}
		if (paddleSecret) {
			updates.paddleWebhookSecret = paddleSecret;
		}
		if (Object.keys(updates).length > 0) {
			upsertMutation.mutate(updates);
		}
	};

	const toggleSection = (section: ExpandedSection) => {
		setExpandedSection((prev) => (prev === section ? null : section));
	};

	const webhookHash = config?.webhookHash;
	const stripeUrl = webhookHash
		? `${BASKET_URL}/webhooks/stripe/${webhookHash}`
		: null;
	const paddleUrl = webhookHash
		? `${BASKET_URL}/webhooks/paddle/${webhookHash}`
		: null;

	return (
		<Sheet onOpenChange={onOpenChangeAction} open={open}>
			<Sheet.Content className="sm:max-w-lg">
				<Sheet.Header>
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded border bg-secondary">
							<CurrencyDollarIcon
								className="size-5 text-primary"
								weight="duotone"
							/>
						</div>
						<div>
							<Sheet.Title>Revenue Tracking</Sheet.Title>
							<Sheet.Description>
								Connect payment providers via webhooks
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<Sheet.Close />

				<Sheet.Body>
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<SpinnerIcon className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : (
						<div className="space-y-1">
							<CollapsibleSection
								badge={
									webhookHash ? (
										<CheckCircleIcon
											className="size-4 text-success"
											weight="duotone"
										/>
									) : undefined
								}
								icon={LinkIcon}
								isExpanded={expandedSection === "webhooks"}
								onToggleAction={() => toggleSection("webhooks")}
								title="Webhook URLs"
							>
								{webhookHash ? (
									<div className="space-y-4">
										<div className="space-y-1.5">
											<div className="flex items-center justify-between">
												<p className="font-medium text-foreground text-xs">
													Stripe
												</p>
												<a
													className="flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
													href="https://dashboard.stripe.com/webhooks/create"
													rel="noopener noreferrer"
													target="_blank"
												>
													Open dashboard
													<ArrowSquareOutIcon className="size-3" />
												</a>
											</div>
											<div className="flex items-center gap-2">
												<code className="flex-1 truncate rounded bg-secondary px-2.5 py-2 font-mono text-xs">
													{stripeUrl}
												</code>
												<Button
													onClick={() => stripeUrl && copyStripeUrl(stripeUrl)}
													size="sm"
													variant="ghost"
												>
													{copiedStripeUrl ? (
														<CheckIcon className="size-4 text-success" />
													) : (
														<ClipboardIcon
															className="size-4"
															weight="duotone"
														/>
													)}
												</Button>
											</div>
										</div>

										<div className="space-y-1.5">
											<div className="flex items-center justify-between">
												<p className="font-medium text-foreground text-xs">
													Paddle
												</p>
												<a
													className="flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
													href="https://vendors.paddle.com/notifications"
													rel="noopener noreferrer"
													target="_blank"
												>
													Open dashboard
													<ArrowSquareOutIcon className="size-3" />
												</a>
											</div>
											<div className="flex items-center gap-2">
												<code className="flex-1 truncate rounded bg-secondary px-2.5 py-2 font-mono text-xs">
													{paddleUrl}
												</code>
												<Button
													onClick={() => paddleUrl && copyPaddleUrl(paddleUrl)}
													size="sm"
													variant="ghost"
												>
													{copiedPaddleUrl ? (
														<CheckIcon className="size-4 text-success" />
													) : (
														<ClipboardIcon
															className="size-4"
															weight="duotone"
														/>
													)}
												</Button>
											</div>
										</div>

										<button
											className="flex w-full items-center justify-center gap-1.5 pt-2 text-muted-foreground text-xs transition-colors hover:text-foreground disabled:opacity-50"
											disabled={regenerateMutation.isPending}
											onClick={() => regenerateMutation.mutate()}
											type="button"
										>
											{regenerateMutation.isPending ? (
												<SpinnerIcon className="size-3 animate-spin" />
											) : (
												<ArrowClockwiseIcon className="size-3" />
											)}
											Regenerate URLs
										</button>
									</div>
								) : (
									<div>
										<p className="mb-3 text-muted-foreground text-xs">
											Generate URLs to receive payment events.
										</p>
										<Button
											className="w-full"
											loading={createWebhookMutation.isPending}
											onClick={() => createWebhookMutation.mutate()}
											size="sm"
											variant="secondary"
										>
											Generate Webhook URLs
										</Button>
									</div>
								)}
							</CollapsibleSection>

							<CollapsibleSection
								badge={
									config?.stripeConfigured ? (
										<CheckCircleIcon
											className="size-4 text-success"
											weight="duotone"
										/>
									) : undefined
								}
								icon={StripeLogoIcon}
								isExpanded={expandedSection === "stripe"}
								onToggleAction={() => toggleSection("stripe")}
								title="Stripe"
							>
								<div className="space-y-4">
									<div className="space-y-1.5">
										<p className="font-medium text-foreground text-xs">
											Signing secret
										</p>
										<div className="flex items-center gap-2">
											<Input
												className="flex-1 font-mono text-xs"
												onChange={(e) => setStripeSecret(e.target.value)}
												placeholder={
													config?.stripeConfigured ? "••••••••" : "whsec_..."
												}
												type={showStripeSecret ? "text" : "password"}
												value={stripeSecret}
											/>
											<Button
												onClick={() => setShowStripeSecret(!showStripeSecret)}
												size="sm"
												variant="ghost"
											>
												{showStripeSecret ? (
													<EyeSlashIcon className="size-4" weight="duotone" />
												) : (
													<EyeIcon className="size-4" weight="duotone" />
												)}
											</Button>
										</div>
									</div>

									<div className="space-y-2">
										<p className="text-muted-foreground text-xs">
											Required events
										</p>
										<div className="flex flex-wrap gap-1">
											{STRIPE_EVENTS.required.map((event) => (
												<code
													className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary"
													key={event}
												>
													{event}
												</code>
											))}
										</div>
									</div>

									{STRIPE_EVENTS.optional.length > 0 && (
										<div className="space-y-2">
											<p className="text-muted-foreground text-xs">Optional</p>
											<div className="flex flex-wrap gap-1">
												{STRIPE_EVENTS.optional.map((event) => (
													<code
														className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
														key={event}
													>
														{event}
													</code>
												))}
											</div>
										</div>
									)}
								</div>
							</CollapsibleSection>

							<CollapsibleSection
								badge={
									config?.paddleConfigured ? (
										<CheckCircleIcon
											className="size-4 text-success"
											weight="duotone"
										/>
									) : undefined
								}
								icon={CurrencyDollarIcon}
								isExpanded={expandedSection === "paddle"}
								onToggleAction={() => toggleSection("paddle")}
								title="Paddle"
							>
								<div className="space-y-4">
									<div className="space-y-1.5">
										<p className="font-medium text-foreground text-xs">
											Signing secret
										</p>
										<div className="flex items-center gap-2">
											<Input
												className="flex-1 font-mono text-xs"
												onChange={(e) => setPaddleSecret(e.target.value)}
												placeholder={
													config?.paddleConfigured
														? "••••••••"
														: "pdl_ntfset_..."
												}
												type={showPaddleSecret ? "text" : "password"}
												value={paddleSecret}
											/>
											<Button
												onClick={() => setShowPaddleSecret(!showPaddleSecret)}
												size="sm"
												variant="ghost"
											>
												{showPaddleSecret ? (
													<EyeSlashIcon className="size-4" weight="duotone" />
												) : (
													<EyeIcon className="size-4" weight="duotone" />
												)}
											</Button>
										</div>
									</div>

									<div className="space-y-2">
										<p className="text-muted-foreground text-xs">
											Required events
										</p>
										<div className="flex flex-wrap gap-1">
											{PADDLE_EVENTS.required.map((event) => (
												<code
													className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary"
													key={event}
												>
													{event}
												</code>
											))}
										</div>
									</div>

									{PADDLE_EVENTS.optional.length > 0 && (
										<div className="space-y-2">
											<p className="text-muted-foreground text-xs">Optional</p>
											<div className="flex flex-wrap gap-1">
												{PADDLE_EVENTS.optional.map((event) => (
													<code
														className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
														key={event}
													>
														{event}
													</code>
												))}
											</div>
										</div>
									)}
								</div>
							</CollapsibleSection>
						</div>
					)}
				</Sheet.Body>

				<Sheet.Footer>
					<Button
						onClick={() => onOpenChangeAction(false)}
						type="button"
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						className="min-w-24"
						disabled={stripeSecret === "" && paddleSecret === ""}
						loading={upsertMutation.isPending}
						onClick={handleSave}
					>
						Save
					</Button>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet>
	);
}

export function RevenueContent({ websiteId }: RevenueContentProps) {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const isMobile = useMediaQuery("(max-width: 640px)");
	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const handleAddFilter = useCallback(
		(field: string, value: string) =>
			addFilterAction({ field, operator: "eq", value }),
		[addFilterAction]
	);

	const { data: config } = useQuery({
		queryKey: ["revenue-config", websiteId],
		queryFn: () => orpc.revenue.get.call({ websiteId }),
	});

	const queries = [
		{ id: "revenue-overview", parameters: ["revenue_overview"], filters },
		{ id: "revenue-time-series", parameters: ["revenue_time_series"], filters },
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const overviewData = (getDataForQuery(
		"revenue-overview",
		"revenue_overview"
	) ?? []) as RevenueOverview[];
	const timeSeriesData = (getDataForQuery(
		"revenue-time-series",
		"revenue_time_series"
	) ?? []) as RevenueTimeSeries[];

	const overview = overviewData[0];
	const hasData = overview && overview.total_transactions > 0;
	const isConfigured = config?.stripeConfigured || config?.paddleConfigured;

	const paddedTimeSeriesData = useMemo(
		() =>
			padTimeSeriesData(
				timeSeriesData,
				dateRange.start_date,
				dateRange.end_date,
				{
					revenue: 0,
					transactions: 0,
					customers: 0,
					refund_amount: 0,
					refund_count: 0,
				}
			),
		[timeSeriesData, dateRange.start_date, dateRange.end_date]
	);

	const chartData = useMemo(
		() =>
			paddedTimeSeriesData.map((row) => ({
				date: row.date,
				revenue: row.revenue,
				transactions: row.transactions,
				avg_transaction:
					row.transactions > 0 ? row.revenue / row.transactions : 0,
				customers: row.customers,
				refunds: Math.abs(row.refund_amount ?? 0),
			})),
		[paddedTimeSeriesData]
	);

	const avgTransaction =
		overview && overview.total_transactions > 0
			? overview.total_revenue / overview.total_transactions
			: 0;

	return (
		<>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Revenue</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					onClick={() => setSettingsOpen(true)}
					size="sm"
					variant="secondary"
				>
					<GearIcon className="size-4 shrink-0" weight="duotone" />
					Configure
				</Button>
			</TopBar.Actions>

			{isLoading || hasData ? (
				<div className="space-y-3 p-4 sm:space-y-4">
					<div className="grid grid-cols-1 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-5">
						<StatCard
							displayMode="text"
							icon={CurrencyDollarIcon}
							id="total-revenue"
							isLoading={isLoading}
							title="Revenue"
							value={formatCurrency(overview?.total_revenue ?? 0)}
						/>
						<StatCard
							displayMode="text"
							icon={ReceiptIcon}
							id="transactions"
							isLoading={isLoading}
							title="Transactions"
							value={overview?.total_transactions ?? 0}
						/>
						<StatCard
							displayMode="text"
							icon={CreditCardIcon}
							id="avg-transaction"
							isLoading={isLoading}
							title="Avg Transaction"
							value={formatCurrency(avgTransaction)}
						/>
						<StatCard
							displayMode="text"
							icon={UsersIcon}
							id="unique-customers"
							isLoading={isLoading}
							title="Customers"
							value={overview?.unique_customers ?? 0}
						/>
						<StatCard
							description={
								overview?.attributed_transactions
									? `${overview.attributed_transactions} of ${overview.total_transactions} attributed`
									: undefined
							}
							displayMode="text"
							icon={TrendUpIcon}
							id="attribution-rate"
							isLoading={isLoading}
							title="Attribution"
							value={
								overview?.total_transactions
									? `${Math.round((overview.attributed_transactions / overview.total_transactions) * 100)}%`
									: "0%"
							}
						/>
					</div>

					<Card>
						<Card.Header className="flex-row items-center justify-between gap-3 py-3">
							<div className="min-w-0 flex-1">
								<Card.Title className="truncate text-sm">
									Revenue Trends
								</Card.Title>
								<Card.Description className="line-clamp-2 text-pretty">
									Revenue, transactions, customers, and refunds over time
								</Card.Description>
							</div>
						</Card.Header>
						<div className="overflow-x-auto">
							<RevenueChart
								data={chartData}
								height={isMobile ? 250 : 350}
								isLoading={isLoading}
							/>
						</div>
					</Card>

					<RevenueAttributionTables
						dateRange={dateRange}
						isLoading={isLoading}
						onAddFilter={handleAddFilter}
						websiteId={websiteId}
					/>
				</div>
			) : (
				<EmptyState
					action={{
						label: isConfigured
							? "Check webhook settings"
							: "Configure webhooks",
						onClick: () => setSettingsOpen(true),
					}}
					description={
						isConfigured
							? "Revenue will appear here once your payment provider sends webhook events."
							: "Connect Stripe or Paddle to start tracking revenue and attribution."
					}
					icon={<CurrencyDollarIcon />}
					title={
						isConfigured
							? "Waiting for transactions"
							: "Set up revenue tracking"
					}
				/>
			)}

			<RevenueSettingsSheet
				onOpenChangeAction={setSettingsOpen}
				open={settingsOpen}
				websiteId={websiteId}
			/>
		</>
	);
}

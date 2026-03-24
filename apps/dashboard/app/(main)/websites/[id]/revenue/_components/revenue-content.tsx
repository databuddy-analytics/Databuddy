"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowsCounterClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { ClipboardIcon } from "@phosphor-icons/react/dist/ssr/Clipboard";
import { CreditCardIcon } from "@phosphor-icons/react/dist/ssr/CreditCard";
import { CurrencyDollarIcon } from "@phosphor-icons/react/dist/ssr/CurrencyDollar";
import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/ssr/EyeSlash";
import { GearIcon } from "@phosphor-icons/react/dist/ssr/Gear";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr/Receipt";
import { SpinnerIcon } from "@phosphor-icons/react/dist/ssr/Spinner";
import { StripeLogoIcon } from "@phosphor-icons/react/dist/ssr/StripeLogo";
import { TrendUpIcon } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useMediaQuery } from "@/hooks/use-media-query";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import { WebsitePageHeader } from "../../_components/website-page-header";
import { RevenueAttributionTables } from "./revenue-attribution-tables";
import { RevenueChart } from "./revenue-chart";

interface RevenueContentProps {
	websiteId: string;
}

interface RevenueOverview {
	total_revenue: number;
	total_transactions: number;
	refund_amount: number;
	refund_count: number;
	subscription_revenue: number;
	subscription_count: number;
	sale_revenue: number;
	sale_count: number;
	unique_customers: number;
	attributed_transactions: number;
	attributed_revenue: number;
}

interface RevenueTimeSeries {
	date: string;
	revenue: number;
	transactions: number;
	customers: number;
	refund_amount: number;
	refund_count: number;
}

const BASKET_URL =
	process.env.NEXT_PUBLIC_BASKET_URL || "https://basket.databuddy.cc";

const STRIPE_EVENTS = {
	required: ["payment_intent.succeeded", "charge.refunded"],
	optional: [
		"payment_intent.payment_failed",
		"payment_intent.canceled",
		"invoice.payment_succeeded",
	],
};

const PADDLE_EVENTS = {
	required: ["transaction.completed"],
	optional: ["transaction.billed"],
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
	icon: React.ComponentType<{ size?: number; weight?: "duotone" }>;
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
						<Icon size={16} weight="duotone" />
						<span className="font-medium text-sm">{title}</span>
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
	const [copiedUrl, setCopiedUrl] = useState<"stripe" | "paddle" | null>(null);

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

	const handleCopyUrl = (url: string, provider: "stripe" | "paddle") => {
		navigator.clipboard.writeText(url);
		setCopiedUrl(provider);
		toast.success("Webhook URL copied");
		setTimeout(() => setCopiedUrl(null), 2000);
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
			<SheetContent className="sm:max-w-lg">
				<SheetHeader>
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded border bg-secondary">
							<CurrencyDollarIcon
								className="size-5 text-primary"
								weight="duotone"
							/>
						</div>
						<div>
							<SheetTitle>Revenue Tracking</SheetTitle>
							<SheetDescription>
								Connect your payment providers via webhooks
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<SheetBody>
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<SpinnerIcon className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : (
						<div className="space-y-1">
							{/* Webhook URLs Section */}
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
										{/* Stripe URL */}
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
													onClick={() =>
														stripeUrl && handleCopyUrl(stripeUrl, "stripe")
													}
													size="sm"
													variant="ghost"
												>
													{copiedUrl === "stripe" ? (
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

										{/* Paddle URL */}
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
													onClick={() =>
														paddleUrl && handleCopyUrl(paddleUrl, "paddle")
													}
													size="sm"
													variant="ghost"
												>
													{copiedUrl === "paddle" ? (
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
											Generate webhook URLs to start receiving payment events.
										</p>
										<Button
											className="w-full"
											disabled={createWebhookMutation.isPending}
											onClick={() => createWebhookMutation.mutate()}
											size="sm"
											variant="secondary"
										>
											{createWebhookMutation.isPending ? (
												<SpinnerIcon className="mr-2 size-4 animate-spin" />
											) : null}
											Generate Webhook URLs
										</Button>
									</div>
								)}
							</CollapsibleSection>

							{/* Stripe Section */}
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

							{/* Paddle Section */}
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
				</SheetBody>

				<SheetFooter>
					<Button
						onClick={() => onOpenChangeAction(false)}
						type="button"
						variant="ghost"
					>
						Cancel
					</Button>
					<Button
						className="min-w-24"
						disabled={
							upsertMutation.isPending ||
							(stripeSecret === "" && paddleSecret === "")
						}
						onClick={handleSave}
					>
						{upsertMutation.isPending ? (
							<SpinnerIcon className="size-4 animate-spin" />
						) : (
							"Save"
						)}
					</Button>
				</SheetFooter>
			</SheetContent>
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

	const paddedTimeSeriesData = useMemo(() => {
		return padTimeSeriesData(
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
		);
	}, [timeSeriesData, dateRange.start_date, dateRange.end_date]);

	const chartData = useMemo(() => {
		return paddedTimeSeriesData.map((row) => ({
			date: row.date,
			revenue: row.revenue,
			transactions: row.transactions,
			avg_transaction:
				row.transactions > 0 ? row.revenue / row.transactions : 0,
			customers: row.customers,
			refunds: Math.abs(row.refund_amount ?? 0),
		}));
	}, [paddedTimeSeriesData]);

	const avgTransaction =
		overview && overview.total_transactions > 0
			? overview.total_revenue / overview.total_transactions
			: 0;

	const getSubtitle = () => {
		if (isConfigured) {
			const providers: string[] = [];
			if (config?.stripeConfigured) {
				providers.push("Stripe");
			}
			if (config?.paddleConfigured) {
				providers.push("Paddle");
			}
			return `Connected to ${providers.join(" & ")}`;
		}
		return "Not configured";
	};

	return (
		<>
			<WebsitePageHeader
				additionalActions={
					<Button onClick={() => setSettingsOpen(true)} variant="outline">
						<GearIcon className="mr-2 size-4" weight="duotone" />
						Configure
					</Button>
				}
				description="Track revenue from Stripe and Paddle"
				docsUrl="https://databuddy.cc/docs/revenue"
				icon={<CurrencyDollarIcon />}
				isLoading={isLoading}
				subtitle={getSubtitle()}
				title="Revenue"
				websiteId={websiteId}
			/>

			{isLoading || hasData ? (
				<div className="space-y-3 p-4">
					<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
							description={
								overview?.refund_count
									? `${overview.refund_count} refunds`
									: undefined
							}
							displayMode="text"
							icon={ArrowsCounterClockwiseIcon}
							id="refunds"
							isLoading={isLoading}
							title="Refunds"
							value={formatCurrency(Math.abs(overview?.refund_amount ?? 0))}
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
									? `${overview.attributed_transactions} of ${overview.total_transactions} transactions`
									: undefined
							}
							displayMode="text"
							icon={TrendUpIcon}
							id="attribution-rate"
							isLoading={isLoading}
							title="Attribution Rate"
							value={
								overview?.total_transactions
									? `${Math.round((overview.attributed_transactions / overview.total_transactions) * 100)}%`
									: "0%"
							}
						/>
					</div>
					<div className="rounded border bg-sidebar">
						<div className="flex flex-col items-start justify-between gap-3 border-b px-3 py-2.5 sm:flex-row sm:px-4 sm:py-3">
							<div className="min-w-0 flex-1">
								<h2 className="font-semibold text-base text-sidebar-foreground sm:text-lg">
									Revenue Trends
								</h2>
								<p className="text-sidebar-foreground/70 text-xs sm:text-sm">
									Daily revenue, transactions, customers, and refunds
								</p>
							</div>
						</div>
						<div className="overflow-x-auto">
							<RevenueChart
								className="rounded border-0"
								data={chartData}
								height={isMobile ? 250 : 350}
								isLoading={isLoading}
							/>
						</div>
					</div>

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
						label: "Configure Webhooks",
						onClick: () => setSettingsOpen(true),
					}}
					description={
						isConfigured
							? "Revenue data will appear here once transactions are processed through your payment provider webhooks."
							: "Connect Stripe or Paddle to start tracking revenue from your payment providers."
					}
					icon={<CurrencyDollarIcon />}
					showPlusBadge={false}
					title={
						isConfigured ? "No revenue data yet" : "Set up revenue tracking"
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

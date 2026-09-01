"use client";

import { publicConfig } from "@databuddy/env/public";
import { normalizeCurrencyCode } from "@databuddy/shared/currency";
import { STRIPE_WEBHOOK_EVENTS } from "@databuddy/shared/stripe-webhooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { orpc } from "@/lib/orpc";
import { Accordion, Sheet } from "@databuddy/ui/client";
import { Button, EmptyState, Field, Input } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CheckIcon,
	ClipboardIcon,
	CreditCardIcon as StripeLogoIcon,
	CurrencyDollarIcon,
	EyeIcon,
	EyeSlashIcon,
	LinkIcon,
	SpinnerIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";

const BASKET_URL = publicConfig.urls.basket;

const PADDLE_REQUIRED_EVENTS = ["transaction.completed"];

type ExpandedSection = "webhooks" | "stripe" | "paddle" | null;

function SettingsSection({
	icon: Icon,
	title,
	badge,
	isOpen,
	onOpenChange,
	children,
}: {
	badge?: ReactNode;
	children: ReactNode;
	icon: ComponentType<{ className?: string; weight?: "duotone" }>;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
}) {
	return (
		<div className="overflow-hidden rounded-md border border-border/60">
			<Accordion onOpenChange={onOpenChange} open={isOpen}>
				<Accordion.Trigger>
					<Icon className="size-4 shrink-0 text-muted-foreground" />
					<span className="font-semibold text-sm">{title}</span>
					{badge ? <span className="ml-auto">{badge}</span> : null}
				</Accordion.Trigger>
				<Accordion.Content>{children}</Accordion.Content>
			</Accordion>
		</div>
	);
}

export function RevenueSettingsSheet({
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
	const [currencyDraft, setCurrencyDraft] = useState<string | null>(null);
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

	const {
		data: config,
		isError: isConfigError,
		isLoading,
		refetch: refetchConfig,
	} = useQuery(orpc.revenue.get.queryOptions({ input: { websiteId } }));
	const savedCurrency = normalizeCurrencyCode(config?.currency);
	const configuredCurrency =
		typeof config?.currency === "string"
			? config.currency.trim().toUpperCase()
			: "USD";
	const currencyValue = currencyDraft ?? configuredCurrency;
	const normalizedCurrency = normalizeCurrencyCode(currencyValue);
	const currencyInvalid = normalizedCurrency === null;
	const hasChanges =
		!(isLoading || isConfigError) &&
		Boolean(
			stripeSecret ||
				paddleSecret ||
				(normalizedCurrency && normalizedCurrency !== savedCurrency)
		);

	const createWebhookMutation = useMutation({
		mutationFn: () => {
			if (!normalizedCurrency) {
				throw new Error("Invalid revenue currency");
			}
			return orpc.revenue.upsert.call({
				websiteId,
				currency: normalizedCurrency,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.revenue.get.key({ input: { websiteId } }),
			});
			toast.success("Webhook URLs generated");
		},
		onError: () => toast.error("Failed to generate webhook URL"),
	});

	const upsertMutation = useMutation({
		mutationFn: (data: {
			stripeWebhookSecret?: string;
			paddleWebhookSecret?: string;
			currency: string;
		}) => orpc.revenue.upsert.call({ websiteId, ...data }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.revenue.get.key({ input: { websiteId } }),
			});
			setStripeSecret("");
			setPaddleSecret("");
			setCurrencyDraft(null);
			toast.success("Configuration saved");
		},
		onError: () => toast.error("Failed to save"),
	});

	const regenerateMutation = useMutation({
		mutationFn: () => orpc.revenue.regenerateHash.call({ websiteId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.revenue.get.key({ input: { websiteId } }),
			});
			toast.success("Webhook URLs regenerated");
		},
		onError: () => toast.error("Failed to regenerate"),
	});

	const handleSave = () => {
		if (!normalizedCurrency) {
			return;
		}

		const updates: {
			stripeWebhookSecret?: string;
			paddleWebhookSecret?: string;
			currency: string;
		} = { currency: normalizedCurrency };
		if (stripeSecret) {
			updates.stripeWebhookSecret = stripeSecret;
		}
		if (paddleSecret) {
			updates.paddleWebhookSecret = paddleSecret;
		}
		upsertMutation.mutate(updates);
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
			<Sheet.Content className="w-full sm:max-w-lg" side="right">
				<Sheet.Header>
					<div className="flex items-center gap-4">
						<div className="flex size-11 items-center justify-center rounded border bg-secondary">
							<CurrencyDollarIcon className="size-5 text-primary" />
						</div>
						<div>
							<Sheet.Title className="text-lg">Revenue Tracking</Sheet.Title>
							<Sheet.Description>
								Connect payment providers via webhooks
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>

				<Sheet.Form
					onSubmit={(event) => {
						event.preventDefault();
						handleSave();
					}}
				>
					<Sheet.Body className="space-y-5">
						{isLoading ? (
							<div className="flex items-center justify-center py-12">
								<SpinnerIcon className="size-6 animate-spin text-muted-foreground" />
							</div>
						) : isConfigError ? (
							<div className="flex min-h-[280px] items-center justify-center p-4">
								<EmptyState
									action={{
										label: "Retry",
										onClick: async () => {
											await refetchConfig();
										},
									}}
									description="We couldn't load revenue settings. Try again in a moment."
									icon={<WarningCircleIcon />}
									title="Couldn't load settings"
									variant="error"
								/>
							</div>
						) : (
							<>
								<Field error={currencyInvalid}>
									<Field.Label>Currency</Field.Label>
									<Input
										autoCapitalize="characters"
										className="font-mono uppercase"
										maxLength={3}
										onChange={(event) =>
											setCurrencyDraft(event.target.value.toUpperCase())
										}
										placeholder="USD"
										value={currencyValue}
									/>
									{currencyInvalid ? (
										<Field.Error>
											Enter a valid three-letter ISO currency code.
										</Field.Error>
									) : (
										<Field.Description>
											Only matching transactions are shown in revenue reports.
										</Field.Description>
									)}
								</Field>

								<div className="space-y-1">
									<SettingsSection
										badge={
											webhookHash ? (
												<CheckCircleIcon className="size-4 text-success" />
											) : undefined
										}
										icon={LinkIcon}
										isOpen={expandedSection === "webhooks"}
										onOpenChange={(open) =>
											setExpandedSection(open ? "webhooks" : null)
										}
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
															aria-label="Copy Stripe webhook URL"
															onClick={() =>
																stripeUrl && copyStripeUrl(stripeUrl)
															}
															size="sm"
															variant="ghost"
														>
															{copiedStripeUrl ? (
																<CheckIcon className="size-4 text-success" />
															) : (
																<ClipboardIcon className="size-4" />
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
															aria-label="Copy Paddle webhook URL"
															onClick={() =>
																paddleUrl && copyPaddleUrl(paddleUrl)
															}
															size="sm"
															variant="ghost"
														>
															{copiedPaddleUrl ? (
																<CheckIcon className="size-4 text-success" />
															) : (
																<ClipboardIcon className="size-4" />
															)}
														</Button>
													</div>
												</div>

												<Button
													className="h-auto w-full justify-center px-0 pt-2 text-muted-foreground text-xs"
													disabled={regenerateMutation.isPending}
													onClick={() => regenerateMutation.mutate()}
													size="sm"
													variant="ghost"
												>
													{regenerateMutation.isPending ? (
														<SpinnerIcon className="size-3 animate-spin" />
													) : (
														<ArrowClockwiseIcon className="size-3" />
													)}
													Regenerate URLs
												</Button>
											</div>
										) : (
											<div>
												<p className="mb-3 text-muted-foreground text-xs">
													Generate URLs to receive payment events.
												</p>
												<Button
													className="w-full"
													disabled={currencyInvalid}
													loading={createWebhookMutation.isPending}
													onClick={() => createWebhookMutation.mutate()}
													size="sm"
													variant="secondary"
												>
													Generate Webhook URLs
												</Button>
											</div>
										)}
									</SettingsSection>

									<SettingsSection
										badge={
											config?.stripeConfigured ? (
												<CheckCircleIcon className="size-4 text-success" />
											) : undefined
										}
										icon={StripeLogoIcon}
										isOpen={expandedSection === "stripe"}
										onOpenChange={(open) =>
											setExpandedSection(open ? "stripe" : null)
										}
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
															config?.stripeConfigured
																? "••••••••"
																: "whsec_..."
														}
														type={showStripeSecret ? "text" : "password"}
														value={stripeSecret}
													/>
													<Button
														aria-label={
															showStripeSecret
																? "Hide Stripe signing secret"
																: "Show Stripe signing secret"
														}
														onClick={() =>
															setShowStripeSecret(!showStripeSecret)
														}
														size="sm"
														variant="ghost"
													>
														{showStripeSecret ? (
															<EyeSlashIcon className="size-4" />
														) : (
															<EyeIcon className="size-4" />
														)}
													</Button>
												</div>
											</div>

											<div className="space-y-2">
												<p className="text-muted-foreground text-xs">
													Required events
												</p>
												<div className="flex flex-wrap gap-1">
													{STRIPE_WEBHOOK_EVENTS.required.map(({ event }) => (
														<code
															className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary"
															key={event}
														>
															{event}
														</code>
													))}
												</div>
											</div>

											{STRIPE_WEBHOOK_EVENTS.optional.length > 0 && (
												<div className="space-y-2">
													<p className="text-muted-foreground text-xs">
														Optional
													</p>
													<div className="flex flex-wrap gap-1">
														{STRIPE_WEBHOOK_EVENTS.optional.map(({ event }) => (
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
									</SettingsSection>

									<SettingsSection
										badge={
											config?.paddleConfigured ? (
												<CheckCircleIcon className="size-4 text-success" />
											) : undefined
										}
										icon={CurrencyDollarIcon}
										isOpen={expandedSection === "paddle"}
										onOpenChange={(open) =>
											setExpandedSection(open ? "paddle" : null)
										}
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
														aria-label={
															showPaddleSecret
																? "Hide Paddle signing secret"
																: "Show Paddle signing secret"
														}
														onClick={() =>
															setShowPaddleSecret(!showPaddleSecret)
														}
														size="sm"
														variant="ghost"
													>
														{showPaddleSecret ? (
															<EyeSlashIcon className="size-4" />
														) : (
															<EyeIcon className="size-4" />
														)}
													</Button>
												</div>
											</div>

											<div className="space-y-2">
												<p className="text-muted-foreground text-xs">
													Required events
												</p>
												<div className="flex flex-wrap gap-1">
													{PADDLE_REQUIRED_EVENTS.map((event) => (
														<code
															className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary"
															key={event}
														>
															{event}
														</code>
													))}
												</div>
											</div>
										</div>
									</SettingsSection>
								</div>
							</>
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
							disabled={
								isLoading || isConfigError || currencyInvalid || !hasChanges
							}
							loading={upsertMutation.isPending}
							type="submit"
						>
							Save Changes
						</Button>
					</Sheet.Footer>
				</Sheet.Form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}

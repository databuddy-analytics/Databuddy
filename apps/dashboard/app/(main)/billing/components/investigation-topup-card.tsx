"use client";

import {
	INVESTIGATION_USAGE,
	investigationQuantitySchema,
} from "@databuddy/shared/billing";
import { Button, Card, dayjs, Field, Input, Skeleton } from "@databuddy/ui";
import { useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useBillingContext,
	useInvestigationUsage,
} from "@/components/providers/billing-provider";
import type { summarizeInvestigationBalance } from "@/lib/investigation-usage";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";

export function InvestigationTopupCard() {
	const { attach } = useCustomer();
	const { canUserUpgrade, isLoading } = useBillingContext();
	const usage = useInvestigationUsage();
	const { balance, fixedPrice, payAsYouGo, unlimited } = usage;
	const [quantity, setQuantity] = useState("10");
	const [isAttaching, setIsAttaching] = useState(false);
	const [showPurchase, setShowPurchase] = useState(false);
	const parsedQuantity = investigationQuantitySchema.safeParse(
		Number(quantity)
	);
	const hasAccess = fixedPrice;

	useEffect(() => {
		if (window.location.hash === "#topup") {
			document.getElementById("topup")?.scrollIntoView({ block: "start" });
			setShowPurchase(true);
		}
	}, []);

	async function purchase() {
		if (
			!(parsedQuantity.success && canUserUpgrade && hasAccess) ||
			payAsYouGo ||
			usage.overageAllowed
		) {
			return;
		}
		setIsAttaching(true);
		try {
			await attach({
				planId: INVESTIGATION_USAGE.topupPlanId,
				featureQuantities: [
					{
						featureId: INVESTIGATION_USAGE.featureId,
						quantity: parsedQuantity.data,
					},
				],
				successUrl: `${window.location.origin}/billing`,
			});
		} catch (error) {
			toast.error(
				getUserFacingErrorMessage(
					error,
					"We couldn't open checkout. Try again."
				)
			);
		} finally {
			setIsAttaching(false);
		}
	}

	return (
		<Card className="scroll-mt-6" id="topup">
			<Card.Header>
				<Card.Title className="text-balance">Investigations</Card.Title>
			</Card.Header>
			<Card.Content className="space-y-4">
				{isLoading ? (
					<Skeleton className="h-16" />
				) : unlimited ? (
					<p className="text-pretty text-muted-foreground text-sm">
						Unlimited investigations
					</p>
				) : fixedPrice &&
					usage.monthly.length === 0 &&
					usage.prepaid.length === 0 ? (
					<p className="text-pretty text-muted-foreground text-sm">
						{Math.max(0, balance).toLocaleString()} investigations available
					</p>
				) : null}
				{fixedPrice && !isLoading && !unlimited && (
					<InvestigationBalanceDetails usage={usage} />
				)}
				{isLoading ? (
					<Skeleton className="h-8 w-56" />
				) : hasAccess && (payAsYouGo || usage.overageAllowed) ? (
					<InvestigationAdditionalUsage usage={usage} />
				) : hasAccess && !showPurchase ? (
					<Button variant="secondary" onClick={() => setShowPurchase(true)}>
						Buy investigations
					</Button>
				) : hasAccess ? (
					<div className="motion-safe:fade-in motion-safe:slide-in-from-top-1 space-y-4 motion-safe:animate-in motion-safe:duration-150">
						<p className="text-pretty text-muted-foreground text-sm">
							Purchased investigations do not expire.
							{!fixedPrice &&
								" Buying switches future investigations to $1 each; your AI credits are preserved for chat."}
						</p>
						<Field className="max-w-xs" error={!parsedQuantity.success}>
							<Field.Label>Investigations to buy</Field.Label>
							<Input
								disabled={isAttaching}
								max={INVESTIGATION_USAGE.maxPurchase}
								min={1}
								onChange={(event) => setQuantity(event.target.value)}
								step={1}
								type="number"
								value={quantity}
							/>
							<Field.Description>
								1–1,000 investigations, $1 each.
							</Field.Description>
							{!parsedQuantity.success && (
								<Field.Error>
									Enter a whole number between 1 and 1,000.
								</Field.Error>
							)}
						</Field>
						<Button
							aria-label={isAttaching ? "Opening checkout…" : undefined}
							disabled={
								!(parsedQuantity.success && canUserUpgrade) ||
								isLoading ||
								isAttaching
							}
							loading={isAttaching}
							onClick={purchase}
						>
							{parsedQuantity.success
								? `Buy ${parsedQuantity.data} investigations · $${(parsedQuantity.data * INVESTIGATION_USAGE.priceUsd).toFixed(2)}`
								: "Buy investigations"}
						</Button>
						{!canUserUpgrade && (
							<p className="text-muted-foreground text-sm">
								Ask an organization owner or admin to add balance.
							</p>
						)}
					</div>
				) : (
					<Button asChild variant="secondary">
						<a
							href="https://www.databuddy.cc/contact?topic=intelligence-business"
							rel="noopener noreferrer"
							target="_blank"
						>
							Request investigation access
						</a>
					</Button>
				)}
			</Card.Content>
		</Card>
	);
}

export function InvestigationAdditionalUsage({
	usage,
}: {
	usage: ReturnType<typeof summarizeInvestigationBalance>;
}) {
	if (!usage.payAsYouGo) {
		return (
			<p className="text-pretty text-muted-foreground text-sm">
				Additional investigations are enabled for your account.
			</p>
		);
	}
	return (
		<div className="space-y-2 text-pretty text-muted-foreground text-sm">
			{usage.usagePrices.map((price) => {
				let description = price.tiered
					? "Extra investigations follow your plan’s usage rates."
					: "Your extra investigation rate is unavailable. Check your billing settings.";
				if (!price.tiered && price.amount === 0) {
					description = "Extra investigations have no usage charge.";
				} else if (
					!price.tiered &&
					price.amount !== null &&
					price.amount > 0 &&
					price.billingUnits > 0
				) {
					const amount = price.amount.toLocaleString("en-US", {
						style: "currency",
						currency: "USD",
						minimumFractionDigits: 0,
						maximumFractionDigits: 6,
					});
					const unit =
						price.billingUnits === 1
							? "extra investigation"
							: `${price.billingUnits.toLocaleString()} extra investigations`;
					description = `${amount} per ${unit} on your invoice.`;
				}
				return <p key={price.id}>{description}</p>;
			})}
			{!usage.overageAllowed && <p>Extra usage is currently unavailable.</p>}
		</div>
	);
}

export function InvestigationBalanceDetails({
	usage,
}: {
	usage: ReturnType<typeof summarizeInvestigationBalance>;
}) {
	return (
		<div className="space-y-3 text-sm">
			{usage.monthly.map((monthly) => (
				<div key={monthly.id}>
					<p className="text-pretty font-medium">Monthly allowance</p>
					<p className="text-pretty text-muted-foreground tabular-nums">
						{monthly.included.toLocaleString()} included ·{" "}
						{monthly.used.toLocaleString()} used ·{" "}
						{monthly.remaining.toLocaleString()} remaining
					</p>
					<p className="text-pretty text-muted-foreground text-xs">
						{monthly.resetsAt
							? `Resets ${dayjs(monthly.resetsAt).format("MMM D, YYYY")}`
							: "Reset date unavailable"}
					</p>
				</div>
			))}
			{usage.prepaid.map((prepaid) => (
				<div key={prepaid.id}>
					<p className="text-pretty font-medium">Purchased balance</p>
					<p className="text-pretty text-muted-foreground tabular-nums">
						{prepaid.remaining.toLocaleString()} remaining ·{" "}
						{prepaid.expiresAt
							? `Expires ${dayjs(prepaid.expiresAt).format("MMM D, YYYY")}`
							: "Does not expire"}
					</p>
				</div>
			))}
			{usage.payAsYouGo && usage.overage > 0 && (
				<div>
					<p className="text-pretty font-medium">Estimated additional usage</p>
					<p className="text-pretty text-muted-foreground tabular-nums">
						{usage.overage.toLocaleString()} additional{" "}
						{usage.overage === 1 ? "investigation" : "investigations"} this
						billing period
					</p>
				</div>
			)}
		</div>
	);
}

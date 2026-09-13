"use client";

import {
	INVESTIGATION_USAGE,
	investigationQuantitySchema,
} from "@databuddy/shared/billing";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { Button, Card, dayjs, Field, Input } from "@databuddy/ui";
import { useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useBillingContext,
	useInvestigationUsage,
} from "@/components/providers/billing-provider";
import { quoteInvestigationPurchase } from "@/lib/investigation-purchase";
import type { summarizeInvestigationBalance } from "@/lib/investigation-usage";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";

export function InvestigationTopupCard() {
	const { attach } = useCustomer();
	const { canUserUpgrade, isFeatureEnabled, isLoading } = useBillingContext();
	const usage = useInvestigationUsage();
	const { balance, fixedPrice, payAsYouGo, unlimited } = usage;
	const [quantity, setQuantity] = useState("10");
	const [isAttaching, setIsAttaching] = useState(false);
	const parsedQuantity = investigationQuantitySchema.safeParse(
		Number(quantity)
	);
	const quote = parsedQuantity.success
		? quoteInvestigationPurchase(parsedQuantity.data)
		: null;
	const hasAccess = isFeatureEnabled(GATED_FEATURES.INVESTIGATIONS);

	useEffect(() => {
		if (window.location.hash === "#topup") {
			document.getElementById("topup")?.scrollIntoView({ block: "start" });
		}
	}, []);

	async function purchase() {
		if (!(quote && canUserUpgrade && hasAccess) || payAsYouGo) {
			return;
		}
		setIsAttaching(true);
		try {
			await attach({
				planId: quote.planId,
				featureQuantities: quote.featureQuantities,
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
				<Card.Description className="text-pretty">
					{INVESTIGATION_USAGE.description}
				</Card.Description>
			</Card.Header>
			<Card.Content className="space-y-4">
				{!isLoading && (
					<p className="text-pretty text-muted-foreground text-sm">
						{fixedPrice
							? unlimited
								? "Your plan has unlimited investigations."
								: `${Math.max(0, balance).toLocaleString()} investigations available from your allowance and purchased balance.`
							: "Your investigations currently use legacy AI credit terms. Buying investigations switches future investigations to the purchased balance. Switching plan versions uses the new plan’s investigation allowance and pricing. Existing AI credits remain available for chat."}
					</p>
				)}
				{fixedPrice && !isLoading && !unlimited && (
					<InvestigationBalanceDetails usage={usage} />
				)}
				{hasAccess && payAsYouGo ? (
					<p className="text-pretty text-muted-foreground text-sm">
						Additional investigations cost ${INVESTIGATION_USAGE.priceUsd} each
						and are billed on your invoice.
						{!usage.overageAllowed &&
							" Additional usage is currently unavailable. Check your billing settings."}
					</p>
				) : hasAccess ? (
					<>
						<p className="text-pretty text-muted-foreground text-sm">
							Purchased investigations do not expire.
						</p>
						<Field className="max-w-xs" error={!parsedQuantity.success}>
							<Field.Label>Investigations to buy</Field.Label>
							<Input
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
							disabled={!(quote && canUserUpgrade) || isLoading || isAttaching}
							onClick={purchase}
						>
							{isAttaching
								? "Opening checkout…"
								: quote
									? `Buy ${parsedQuantity.data} investigations · $${quote.costUsd.toFixed(2)}`
									: "Buy investigations"}
						</Button>
						{!canUserUpgrade && (
							<p className="text-muted-foreground text-sm">
								Ask an organization owner or admin to add balance.
							</p>
						)}
					</>
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
			{usage.payAsYouGo && (
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

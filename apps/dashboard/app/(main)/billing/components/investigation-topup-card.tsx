"use client";

import {
	INVESTIGATION_USAGE,
	investigationQuantitySchema,
} from "@databuddy/shared/billing";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { Button, Card, Field, Input } from "@databuddy/ui";
import { useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useBillingContext,
	useInvestigationUsage,
} from "@/components/providers/billing-provider";
import { quoteInvestigationPurchase } from "@/lib/investigation-purchase";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";

export function InvestigationTopupCard() {
	const { attach } = useCustomer();
	const { canUserUpgrade, isFeatureEnabled, isLoading } = useBillingContext();
	const { balance, fixedPrice, unlimited } = useInvestigationUsage();
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
		if (!(quote && canUserUpgrade && hasAccess)) {
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
				<Card.Title>Investigations · $1 each</Card.Title>
				<Card.Description>{INVESTIGATION_USAGE.description}</Card.Description>
			</Card.Header>
			<Card.Content className="space-y-4">
				{!isLoading && (
					<p className="text-muted-foreground text-sm">
						{fixedPrice
							? unlimited
								? "Your plan has unlimited investigations."
								: `${balance.toLocaleString()} investigations remaining.`
							: "Your investigations currently use legacy AI credit terms. Buying investigations or switching to a new plan version changes future investigations to $1 each; your existing AI credits remain available for chat."}
					</p>
				)}
				<p className="text-muted-foreground text-sm">
					Prepaid investigations do not expire. Plan AI credits are separate; no
					investigations are bundled with the new plan versions.
				</p>
				{hasAccess ? (
					<>
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

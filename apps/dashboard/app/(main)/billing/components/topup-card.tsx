"use client";

import { CreditArcSlider } from "@/components/ui/credit-arc-slider";
import { cn } from "@/lib/utils";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { DATABUNNY_USAGE } from "@databuddy/shared/billing";
import {
	blendedRatePerCredit,
	calculateTopupCost,
	getTierBoundary,
	nextTierNudge,
	TOPUP_FEATURE_ID,
	TOPUP_MAX_QUANTITY,
	TOPUP_MIN_QUANTITY,
	TOPUP_PRODUCT_ID,
	TOPUP_TIERS,
} from "@/lib/topup-math";
import { useCustomer } from "autumn-js/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CaretDownIcon, CoinsIcon, TrendDownIcon } from "@databuddy/ui/icons";
import { Badge, Button, Card, Divider, Text } from "@databuddy/ui";

const PRESET_QUANTITIES = [100, 500, 2500, 10_000];
const BASE_RATE = TOPUP_TIERS[0].amount;
const FIRST_TIER_TOP =
	TOPUP_TIERS[0].to === "inf" ? Number.POSITIVE_INFINITY : TOPUP_TIERS[0].to;
const SECOND_TIER_RATE = TOPUP_TIERS[1].amount;

export function TopupCard() {
	const { attach } = useCustomer();
	const [quantity, setQuantity] = useState(500);
	const [isAttaching, setIsAttaching] = useState(false);
	const [showTiers, setShowTiers] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		if (window.location.hash !== "#topup") {
			return;
		}
		const el = document.getElementById("topup");
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	const cost = useMemo(() => calculateTopupCost(quantity), [quantity]);
	const blendedRate = useMemo(() => blendedRatePerCredit(quantity), [quantity]);
	const nudge = useMemo(() => nextTierNudge(quantity), [quantity]);
	const tierInfo = useMemo(() => getTierBoundary(quantity), [quantity]);
	const savings = useMemo(
		() => Math.max(0, quantity * BASE_RATE - cost),
		[quantity, cost]
	);

	const handlePurchase = async () => {
		setIsAttaching(true);
		try {
			await attach({
				planId: TOPUP_PRODUCT_ID,
				featureQuantities: [{ featureId: TOPUP_FEATURE_ID, quantity }],
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
	};

	return (
		<Card className="scroll-mt-6" id="topup">
			<Card.Header>
				<Card.Title className="flex items-center gap-2">
					<CoinsIcon className="text-primary" size={14} weight="duotone" />
					Top up Databunny usage
				</Card.Title>
				<Card.Description>
					{DATABUNNY_USAGE.description} Purchased usage stacks with your plan
					and does not expire.
				</Card.Description>
			</Card.Header>
			<Card.Content className="space-y-5">
				<div className="flex flex-col items-center gap-3">
					<div className="w-full max-w-sm">
						<CreditArcSlider
							ariaLabel="Databunny usage units to buy"
							max={TOPUP_MAX_QUANTITY}
							min={TOPUP_MIN_QUANTITY}
							onValueChange={setQuantity}
							value={quantity}
							unit={DATABUNNY_USAGE.unit}
						/>
					</div>

					<div className="flex flex-wrap items-center justify-center gap-2">
						{PRESET_QUANTITIES.map((preset) => (
							<Button
								aria-pressed={quantity === preset}
								className="rounded border border-border/60 bg-card px-3 py-1 text-xs tabular-nums transition-colors hover:border-primary/60 hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground"
								key={preset}
								onClick={() => setQuantity(preset)}
								size="sm"
								variant="secondary"
							>
								{preset.toLocaleString()}
							</Button>
						))}
					</div>
				</div>

				<Divider />

				<div className="space-y-2">
					<Row label="You get">
						<span className="tabular-nums">
							{quantity.toLocaleString()} usage units
						</span>
					</Row>
					<Row label="Average per usage unit">
						<span className="tabular-nums">${blendedRate.toFixed(4)}</span>
					</Row>
					<Row label="You pay">
						<span className="font-semibold text-foreground tabular-nums">
							${cost.toFixed(2)}
						</span>
					</Row>
				</div>

				<NudgeSlot
					blendedRate={blendedRate}
					nudge={nudge}
					quantity={quantity}
					savings={savings}
				/>

				<div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
					<Button
						aria-expanded={showTiers}
						className="flex items-center gap-1 self-start text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
						onClick={() => setShowTiers((s) => !s)}
						size="sm"
						variant="ghost"
					>
						<CaretDownIcon
							className={cn("transition-transform", showTiers && "rotate-180")}
							size={10}
							weight="bold"
						/>
						{showTiers ? "Hide pricing details" : "How pricing works"}
					</Button>
					<Button
						className="sm:min-w-[220px]"
						disabled={isAttaching}
						onClick={handlePurchase}
						size="sm"
					>
						{isAttaching
							? "Opening checkout…"
							: `Buy ${quantity.toLocaleString()} usage units · $${cost.toFixed(2)}`}
					</Button>
				</div>

				<div
					aria-hidden={!showTiers}
					className={cn(
						"grid transition-[grid-template-rows,opacity,margin] duration-(--duration-base) ease-(--expo-out) motion-reduce:transition-none",
						showTiers
							? "grid-rows-[1fr] opacity-100"
							: "-mt-5 grid-rows-[0fr] opacity-0"
					)}
				>
					<div className="overflow-hidden">
						<div className="space-y-2 rounded border border-border/60 bg-secondary/40 p-3">
							<Text tone="muted" variant="caption">
								With graduated pricing, each unit is priced by its tier.
								Reaching a lower rate does not change the price of earlier
								units.
							</Text>
							<div className="rounded border border-border/50 bg-background">
								{TOPUP_TIERS.map((tier, idx) => {
									const prev = idx === 0 ? null : TOPUP_TIERS[idx - 1];
									const tierStart =
										prev === null || prev.to === "inf" ? 1 : prev.to + 1;
									const rangeLabel =
										tier.to === "inf"
											? `${tierStart.toLocaleString()}+`
											: `${tierStart.toLocaleString()} – ${tier.to.toLocaleString()}`;
									const isActive = tier.amount === tierInfo.currentRate;
									return (
										<div
											className="flex items-center justify-between gap-3 border-border/50 border-b px-3 py-2 last:border-b-0"
											key={tier.amount}
										>
											<div className="flex items-center gap-2">
												<Text
													className="tabular-nums"
													tone="muted"
													variant="caption"
												>
													{rangeLabel}
												</Text>
												{isActive && (
													<Badge variant="success">You're here</Badge>
												)}
											</div>
											<Text className="tabular-nums" variant="caption">
												${tier.amount.toFixed(3)} / unit
											</Text>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card>
	);
}

interface NudgeSlotProps {
	blendedRate: number;
	nudge: { nextRate: number; unitsUntilNextTier: number } | null;
	quantity: number;
	savings: number;
}

function NudgeSlot({ blendedRate, nudge, quantity, savings }: NudgeSlotProps) {
	const isCloseToNextTier =
		nudge !== null && nudge.unitsUntilNextTier <= Math.max(50, quantity * 0.5);
	const showSavings = savings > 0.01;
	const belowFirstDiscount = quantity < FIRST_TIER_TOP;

	return (
		<div className="flex min-h-[44px] items-start gap-2 rounded border border-primary/30 bg-primary/5 p-3">
			{isCloseToNextTier && nudge ? (
				<>
					<TrendDownIcon
						className="mt-0.5 shrink-0 text-primary"
						size={14}
						weight="duotone"
					/>
					<Text variant="caption">
						Just{" "}
						<span className="font-medium text-foreground tabular-nums">
							{nudge.unitsUntilNextTier.toLocaleString()}
						</span>{" "}
						more to reach the next tier. Usage units in that tier cost{" "}
						<span className="font-medium text-foreground tabular-nums">
							${nudge.nextRate.toFixed(3)}
						</span>
						.
					</Text>
				</>
			) : showSavings ? (
				<>
					<TrendDownIcon
						className="mt-0.5 shrink-0 text-primary"
						size={14}
						weight="duotone"
					/>
					<Text variant="caption">
						You're saving{" "}
						<span className="font-medium text-foreground tabular-nums">
							${savings.toFixed(2)}
						</span>{" "}
						compared with the first-tier rate — that's{" "}
						<span className="font-medium text-foreground tabular-nums">
							{Math.round((1 - blendedRate / BASE_RATE) * 100)}%
						</span>{" "}
						off.
					</Text>
				</>
			) : belowFirstDiscount ? (
				<>
					<TrendDownIcon
						className="mt-0.5 shrink-0 text-primary"
						size={14}
						weight="duotone"
					/>
					<Text variant="caption">
						After the first{" "}
						<span className="font-medium text-foreground tabular-nums">
							{FIRST_TIER_TOP.toLocaleString()}
						</span>{" "}
						usage units, additional units cost{" "}
						<span className="font-medium text-foreground tabular-nums">
							${SECOND_TIER_RATE.toFixed(3)}
						</span>
						.
					</Text>
				</>
			) : null}
		</div>
	);
}

function Row({
	label,
	children,
}: {
	children: React.ReactNode;
	label: string;
}) {
	return (
		<div className="flex items-center justify-between">
			<Text tone="muted" variant="caption">
				{label}
			</Text>
			<Text variant="label">{children}</Text>
		</div>
	);
}

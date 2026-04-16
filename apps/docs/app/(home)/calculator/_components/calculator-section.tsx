"use client";

import { useState } from "react";
import { SciFiCard } from "@/components/scifi-card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
	calculateCookieBannerCost,
	formatCurrencyFull,
	formatNumber,
	formatPercent,
	VISITOR_DATA_LOSS_RANGE_HIGH,
	VISITOR_DATA_LOSS_RANGE_LOW,
} from "./calculator-engine";
import { ShareButtons } from "./share-buttons";

const DEFAULT_VISITORS = 50_000;
const DEFAULT_VISITOR_DATA_LOSS_RATE = 0.55;
const DEFAULT_VISITOR_TO_PAID = 0.015;
const DEFAULT_REVENUE_PER_CONVERSION = 50;

function percentToSlider(value: number): number {
	return Math.round(value * 1000);
}

function sliderToPercent(value: number): number {
	return value / 1000;
}

export function CalculatorSection() {
	const [monthlyVisitors, setMonthlyVisitors] = useState(DEFAULT_VISITORS);
	const [visitorDataLossRate, setVisitorDataLossRate] = useState(
		DEFAULT_VISITOR_DATA_LOSS_RATE
	);
	const [visitorToPaidRate, setVisitorToPaidRate] = useState(
		DEFAULT_VISITOR_TO_PAID
	);
	const [revenuePerConversion, setRevenuePerConversion] = useState(
		DEFAULT_REVENUE_PER_CONVERSION
	);

	const results = calculateCookieBannerCost({
		monthlyVisitors,
		visitorDataLossRate,
		visitorToPaidRate,
		revenuePerConversion,
	});

	return (
		<section className="mx-auto w-full max-w-5xl" id="calculator">
			<div className="mb-8 text-center">
				<p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
					Cookie Banner Cost Calculator
				</p>
				<h2 className="mb-3 font-bold text-2xl tracking-tight sm:text-3xl">
					Model the measurement gap
				</h2>
				<p className="mx-auto max-w-2xl text-balance text-muted-foreground text-sm">
					Labels say unmeasured and unattributed — not money walking out the
					door. Adjust inputs; outputs update live.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
				<div className="lg:col-span-3">
					<SciFiCard>
						<div className="rounded border border-border bg-card/70 p-5 backdrop-blur-sm sm:p-6">
							<h3 className="mb-5 font-semibold text-sm uppercase tracking-wider">
								Your Numbers
							</h3>

							<div className="space-y-6">
								<InputField
									hint="Total unique visitors per month"
									id="visitors"
									label="Monthly Visitors"
									max={2_000_000}
									min={0}
									onChangeAction={setMonthlyVisitors}
									sliderMax={100}
									sliderStep={1}
									sliderToValue={(v) =>
										Math.round((v / 100) ** 2.5 * 2_000_000)
									}
									suffix="/mo"
									value={monthlyVisitors}
									valueToSlider={(v) =>
										Math.round((v / 2_000_000) ** (1 / 2.5) * 100)
									}
								/>

								<InputField
									displayPercent
									hint="Share of visits that never reach your analytics without consent. Default 55%; yearly range uses 40–70%."
									id="data-loss"
									label="Visitor Data Loss Rate"
									max={0.75}
									min={0}
									onChangeAction={setVisitorDataLossRate}
									sliderMax={750}
									sliderStep={1}
									sliderToValue={sliderToPercent}
									value={visitorDataLossRate}
									valueToSlider={percentToSlider}
								/>

								<InputField
									displayPercent
									hint="What % of all visitors become paying customers? Typical SaaS ~0.5–3%, e-commerce ~1–4%. Use paid conversions, not raw signups."
									id="visitor-paid"
									label="Visitor-to-Paid Rate"
									max={0.05}
									min={0}
									onChangeAction={setVisitorToPaidRate}
									sliderMax={50}
									sliderStep={1}
									sliderToValue={sliderToPercent}
									value={visitorToPaidRate}
									valueToSlider={percentToSlider}
								/>

								<InputField
									hint="Average revenue per paying customer attributed to a visit (order value, subscription, etc.)"
									id="revenue"
									label="Revenue per Conversion"
									max={1000}
									min={0}
									onChangeAction={setRevenuePerConversion}
									prefix="$"
									sliderMax={1000}
									sliderStep={5}
									sliderToValue={(v) => v}
									value={revenuePerConversion}
									valueToSlider={(v) => v}
								/>
							</div>
						</div>
					</SciFiCard>
				</div>

				<div className="lg:col-span-2">
					<SciFiCard>
						<div className="flex h-full flex-col rounded border border-border bg-card/70 p-5 backdrop-blur-sm sm:p-6">
							<h3 className="mb-5 font-semibold text-sm uppercase tracking-wider">
								Unmeasured in cookie analytics
							</h3>

							<div className="flex flex-1 flex-col justify-between gap-4">
								<ResultRow
									label="Unmeasured visitors / mo"
									value={formatNumber(results.lostVisitors)}
								/>
								<ResultRow
									label="Unattributed conversions / mo (modeled)"
									value={formatNumber(results.lostConversions)}
								/>
								<ResultRow
									highlight
									label="Modeled unattributed revenue / mo"
									value={formatCurrencyFull(results.lostRevenueMonthly)}
								/>

								<Separator />

								<div className="rounded border border-destructive/20 bg-destructive/5 p-4">
									<p className="mb-1 text-muted-foreground text-xs uppercase tracking-wider">
										Modeled unattributed revenue / year
									</p>
									<p className="font-bold text-2xl text-destructive tabular-nums tracking-tight sm:text-3xl">
										{formatCurrencyFull(results.lostRevenueYearly)}
									</p>
									<p className="mt-2 text-pretty text-muted-foreground text-xs">
										Range at {formatPercent(VISITOR_DATA_LOSS_RANGE_LOW)}–
										{formatPercent(VISITOR_DATA_LOSS_RANGE_HIGH)} visitor data
										loss (same other inputs):{" "}
										<span className="font-mono text-foreground">
											{formatCurrencyFull(results.lostRevenueYearlyRangeLow)} –{" "}
											{formatCurrencyFull(results.lostRevenueYearlyRangeHigh)}
										</span>
										/year. Not literal profit-and-loss impact — assumes
										conversions scale with traffic.
									</p>
								</div>

								<div className="space-y-2 rounded border border-border bg-card/40 p-3">
									<p className="text-muted-foreground text-xs">
										Side-by-side (no ratio — compare yourself)
									</p>
									<div className="flex flex-col gap-1.5 text-sm">
										<div className="flex justify-between gap-2">
											<span className="text-muted-foreground">
												Modeled measurement gap
											</span>
											<span className="font-semibold tabular-nums">
												{formatCurrencyFull(results.lostRevenueMonthly)}
												/mo
											</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="text-muted-foreground">
												Databuddy ({results.databuddyPlanName})
											</span>
											<span className="font-semibold tabular-nums">
												{formatCurrencyFull(results.databuddyMonthlyCost)}
												/mo
											</span>
										</div>
									</div>
								</div>
							</div>

							<Separator className="my-4" />

							<ShareButtons
								databuddyMonthlyCost={results.databuddyMonthlyCost}
								lostRevenueYearly={results.lostRevenueYearly}
								monthlyVisitors={monthlyVisitors}
							/>
						</div>
					</SciFiCard>
				</div>
			</div>

			<div className="mt-4 text-center">
				<p className="text-pretty text-muted-foreground text-xs">
					Yearly range: {formatPercent(VISITOR_DATA_LOSS_RANGE_LOW)}–
					{formatPercent(VISITOR_DATA_LOSS_RANGE_HIGH)} unmeasured share.
					Sources below. Databuddy needs no consent cookie; any JS can still be
					blocked.
				</p>
			</div>
		</section>
	);
}

interface InputFieldProps {
	displayPercent?: boolean;
	hint: string;
	id: string;
	label: string;
	max: number;
	min: number;
	onChangeAction: (value: number) => void;
	prefix?: string;
	sliderMax: number;
	sliderMin?: number;
	sliderStep: number;
	sliderToValue: (slider: number) => number;
	suffix?: string;
	value: number;
	valueToSlider: (value: number) => number;
}

function InputField({
	id,
	label,
	hint,
	value,
	onChangeAction,
	min,
	max,
	sliderMin = 0,
	sliderMax,
	sliderStep,
	valueToSlider,
	sliderToValue,
	prefix,
	suffix,
	displayPercent,
}: InputFieldProps) {
	const displayValue = displayPercent
		? formatPercent(value)
		: `${prefix ?? ""}${formatNumber(value)}${suffix ?? ""}`;

	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between">
				<Label className="text-sm" htmlFor={id}>
					{label}
				</Label>
				<span className="font-mono font-semibold text-base tabular-nums">
					{displayValue}
				</span>
			</div>
			<Slider
				aria-label={label}
				max={sliderMax}
				min={sliderMin}
				onValueChange={(v) => {
					const raw = sliderToValue(Number(v.at(0) ?? 0));
					onChangeAction(Math.min(max, Math.max(min, raw)));
				}}
				step={sliderStep}
				value={[valueToSlider(value)]}
			/>
			<p className="mt-1.5 text-muted-foreground text-xs">{hint}</p>
		</div>
	);
}

function ResultRow({
	label,
	value,
	highlight = false,
}: {
	label: string;
	value: string;
	highlight?: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span
				className={cn(
					"font-semibold tabular-nums",
					highlight ? "text-base" : "text-sm"
				)}
			>
				{value}
			</span>
		</div>
	);
}

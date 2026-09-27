"use client";

import { track } from "@databuddy/sdk";
import { useEffect, useRef, useState } from "react";
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
} from "./calculator-engine";
import type { CalculatorInputs } from "./calculator-engine";
import { ShareButtons } from "./share-buttons";

function bucketVisitors(visitors: number): string {
	if (visitors < 10_000) {
		return "<10k";
	}
	if (visitors < 100_000) {
		return "10k_100k";
	}
	if (visitors < 1_000_000) {
		return "100k_1m";
	}
	return ">1m";
}

function percentToSlider(value: number): number {
	return Math.round(value * 1000);
}

function sliderToPercent(value: number): number {
	return value / 1000;
}

export function CalculatorSection({
	initialInputs,
}: {
	initialInputs: CalculatorInputs;
}) {
	const [monthlyVisitors, setMonthlyVisitors] = useState(
		initialInputs.monthlyVisitors
	);
	const [visitorDataLossRate, setVisitorDataLossRate] = useState(
		initialInputs.visitorDataLossRate
	);
	const [visitorToPaidRate, setVisitorToPaidRate] = useState(
		initialInputs.visitorToPaidRate
	);
	const [revenuePerConversion, setRevenuePerConversion] = useState(
		initialInputs.revenuePerConversion
	);
	const fired = useRef(false);
	const initial = useRef(initialInputs);
	const inputs = {
		monthlyVisitors,
		visitorDataLossRate,
		visitorToPaidRate,
		revenuePerConversion,
	};
	const results = calculateCookieBannerCost(inputs);

	useEffect(() => {
		if (fired.current) {
			return;
		}
		const changed =
			monthlyVisitors !== initial.current.monthlyVisitors ||
			visitorDataLossRate !== initial.current.visitorDataLossRate ||
			visitorToPaidRate !== initial.current.visitorToPaidRate ||
			revenuePerConversion !== initial.current.revenuePerConversion;
		if (!changed) {
			return;
		}
		const timer = setTimeout(() => {
			if (fired.current) {
				return;
			}
			fired.current = true;
			track("calculator_used", {
				visitors_bucket: bucketVisitors(monthlyVisitors),
			});
		}, 1500);
		return () => clearTimeout(timer);
	}, [
		monthlyVisitors,
		visitorDataLossRate,
		visitorToPaidRate,
		revenuePerConversion,
	]);

	return (
		<section className="mx-auto w-full max-w-5xl" id="calculator">
			<div className="mb-8 text-center">
				<p className="mb-2 text-pretty font-mono text-muted-foreground text-xs uppercase tracking-widest">
					Analytics Measurement Gap
				</p>
				<h2 className="mb-3 text-balance font-bold text-2xl tracking-tight sm:text-3xl">
					Model the measurement gap
				</h2>
				<p className="mx-auto max-w-2xl text-pretty text-muted-foreground text-sm">
					Use your own estimates. The example inputs are assumptions, not
					benchmarks.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
				<div className="lg:col-span-3">
					<SciFiCard>
						<div className="rounded border border-border bg-card/70 p-5 backdrop-blur-sm sm:p-6">
							<h3 className="mb-5 text-balance font-semibold text-sm uppercase tracking-wider">
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
									hint="Your estimate of visitors missing from analytics. The 55% starting value is illustrative."
									id="data-loss"
									label="Unmeasured Share"
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
									hint="Your estimated share of visitors who buy. Use paid conversions, not signups."
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
							<h3 className="mb-5 text-balance font-semibold text-sm uppercase tracking-wider">
								Estimated measurement gap
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
									<p className="mb-1 text-pretty text-muted-foreground text-xs uppercase tracking-wider">
										Modeled unattributed revenue / year
									</p>
									<p className="text-pretty font-bold text-2xl text-destructive tabular-nums tracking-tight sm:text-3xl">
										{formatCurrencyFull(results.lostRevenueYearly)}
									</p>
									<p className="mt-2 text-pretty text-muted-foreground text-xs">
										Assumes measured and unmeasured visitors convert at the same
										rate. This estimates missing attribution, not lost sales or
										recoverable revenue.
									</p>
								</div>
							</div>

							<Separator className="my-4" />

							<ShareButtons inputs={inputs} />
						</div>
					</SciFiCard>
				</div>
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
		: `${prefix ? formatCurrencyFull(value) : formatNumber(value)}${suffix ?? ""}`;

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
			<p className="mt-1.5 text-pretty text-muted-foreground text-xs">{hint}</p>
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
		<div className="flex items-center justify-between gap-3">
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

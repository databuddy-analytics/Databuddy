"use client";

import { orpc } from "@/lib/orpc";
import { useBillingContext } from "@/components/providers/billing-provider";
import {
	calculateTopupCost,
	TOPUP_FEATURE_ID,
	TOPUP_MAX_QUANTITY,
} from "@/lib/topup-math";
import { useMutation } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	BellIcon,
	GearIcon,
	InfinityIcon,
	ShieldCheckIcon,
} from "@databuddy/ui/icons";
import {
	Button,
	Card,
	Divider,
	Field,
	Input,
	Skeleton,
	Text,
} from "@databuddy/ui";
import { Switch } from "@databuddy/ui/client";
import { FEATURE_IDS } from "@databuddy/shared/types/features";
import { cn } from "@/lib/utils";

const TOPUP_DEFAULTS = { threshold: 100, quantity: 1000 };
const TOPUP_LIMITS = {
	threshold: [10, 50_000],
	quantity: [100, TOPUP_MAX_QUANTITY],
} as const;

const ALERT_DEFAULTS = { threshold: 80 };
const ALERT_LIMITS = { threshold: [1, 99] } as const;

const USAGE_LIMIT_DEFAULTS = { overageLimit: 50 };
const USAGE_LIMITS = { overageLimit: [1, 10_000] } as const;

export function BillingControlsCard() {
	const { data: customer, isLoading, refetch } = useCustomer();
	const { canUserUpgrade } = useBillingContext();
	const spendFeatureId = TOPUP_FEATURE_ID;

	const topup = useMemo(() => {
		const e = customer?.billingControls?.autoTopups?.find(
			(t) => t.featureId === TOPUP_FEATURE_ID
		);
		return e
			? { enabled: e.enabled, threshold: e.threshold, quantity: e.quantity }
			: null;
	}, [customer]);

	const alert = useMemo(() => {
		const e = customer?.billingControls?.usageAlerts?.find(
			(a) =>
				a.featureId === FEATURE_IDS.EVENTS &&
				a.thresholdType === "usage_percentage"
		);
		return e ? { enabled: e.enabled, threshold: e.threshold } : null;
	}, [customer]);

	const spend = useMemo(() => {
		const e = customer?.billingControls?.spendLimits?.find(
			(s) => s.featureId === spendFeatureId
		);
		return e && typeof e.overageLimit === "number"
			? { enabled: e.enabled, overageLimit: e.overageLimit }
			: null;
	}, [customer, spendFeatureId]);

	if (!customer) {
		return (
			<Card id="billing-controls">
				<Card.Content>
					{isLoading ? (
						<Skeleton className="h-32" />
					) : (
						<p className="text-pretty text-muted-foreground text-sm">
							Billing settings are unavailable. Refresh to try again.
						</p>
					)}
				</Card.Content>
			</Card>
		);
	}

	return (
		<Card id="billing-controls">
			<Card.Header>
				<Card.Title className="flex items-center gap-2 text-balance">
					<GearIcon className="text-muted-foreground" size={14} />
					Billing controls
				</Card.Title>
			</Card.Header>
			<Card.Content className="p-0">
				{
					<>
						<BillingRow
							canEdit={canUserUpgrade}
							turnOffLabel="Turn off auto top-up"
							defaults={TOPUP_DEFAULTS}
							description="Refill your AI credits when they run low."
							icon={<InfinityIcon size={16} />}
							initial={topup}
							limits={TOPUP_LIMITS}
							messages={{
								error: "Failed to update auto top-up.",
								successDisable: "Auto top-up turned off.",
								successEnable: "Auto top-up enabled.",
							}}
							onSave={(input) => orpc.billing.setAutoTopup.call(input)}
							onSaved={refetch}
							switchLabel="Enable credit auto top-up"
							title="Credit auto top-up"
						>
							{(form, setForm) => (
								<>
									<div className="grid gap-3 sm:grid-cols-2">
										<LabeledNumberInput
											helper={`between ${TOPUP_LIMITS.threshold[0].toLocaleString()} and ${TOPUP_LIMITS.threshold[1].toLocaleString()}`}
											id="auto-topup-threshold"
											label="When balance drops below"
											max={TOPUP_LIMITS.threshold[1]}
											min={TOPUP_LIMITS.threshold[0]}
											onChange={(v) => setForm({ threshold: v })}
											step={10}
											suffix="credits"
											value={form.threshold}
										/>
										<LabeledNumberInput
											helper={`${TOPUP_LIMITS.quantity[0].toLocaleString()}–${TOPUP_LIMITS.quantity[1].toLocaleString()} per refill`}
											id="auto-topup-quantity"
											label="Add this many each time"
											max={TOPUP_LIMITS.quantity[1]}
											min={TOPUP_LIMITS.quantity[0]}
											onChange={(v) => setForm({ quantity: v })}
											step={100}
											suffix="credits"
											value={form.quantity}
										/>
									</div>
									<RefillSummary quantity={form.quantity} />
								</>
							)}
						</BillingRow>
						<Divider />
					</>
				}
				<BillingRow
					canEdit={canUserUpgrade}
					turnOffLabel="Turn off alert"
					defaults={ALERT_DEFAULTS}
					description="Email me before I reach my monthly event allowance."
					icon={<BellIcon size={16} />}
					initial={alert}
					limits={ALERT_LIMITS}
					messages={{
						error: "Failed to update usage alert.",
						successDisable: "Usage alert turned off.",
						successEnable: "Usage alert enabled.",
					}}
					onSave={(input) => orpc.billing.setUsageAlert.call(input)}
					onSaved={refetch}
					switchLabel="Enable usage alert"
					title="Event usage alert"
				>
					{(form, setForm) => (
						<LabeledNumberInput
							helper="Percentage of your monthly event allowance."
							id="events-usage-alert"
							label="Notify me at"
							max={ALERT_LIMITS.threshold[1]}
							min={ALERT_LIMITS.threshold[0]}
							onChange={(v) => setForm({ threshold: v })}
							step={5}
							suffix="%"
							value={form.threshold}
						/>
					)}
				</BillingRow>
				{
					<>
						<Divider />
						<BillingRow
							canEdit={canUserUpgrade}
							turnOffLabel="Remove limit"
							defaults={USAGE_LIMIT_DEFAULTS}
							description="Limit additional AI credit usage."
							icon={<ShieldCheckIcon size={16} />}
							initial={spend}
							limits={USAGE_LIMITS}
							messages={{
								error: "Failed to update usage limit.",
								successDisable: "Usage limit removed.",
								successEnable: "Usage limit set.",
							}}
							onSave={(input) =>
								orpc.billing.setSpendLimit.call({
									...input,
									featureId: spendFeatureId,
								})
							}
							onSaved={refetch}
							switchLabel="Enable credit usage limit"
							title="Credit usage limit"
						>
							{(form, setForm) => (
								<LabeledNumberInput
									helper={`Up to ${USAGE_LIMITS.overageLimit[1].toLocaleString()} additional credits.`}
									id="spend-limit"
									label="Per month"
									max={USAGE_LIMITS.overageLimit[1]}
									min={USAGE_LIMITS.overageLimit[0]}
									onChange={(v) => setForm({ overageLimit: v })}
									step={10}
									suffix="credits"
									value={form.overageLimit}
								/>
							)}
						</BillingRow>
					</>
				}
			</Card.Content>
		</Card>
	);
}

type FormShape = Record<string, number>;
type FormLimits<T extends FormShape> = {
	[K in keyof T]: readonly [number, number];
};

interface BillingRowProps<TForm extends FormShape> {
	canEdit: boolean;
	children: (
		form: TForm,
		setForm: (patch: Partial<TForm>) => void
	) => React.ReactNode;
	defaults: TForm;
	description: string;
	icon: React.ReactNode;
	initial: ({ enabled: boolean } & TForm) | null;
	limits: FormLimits<TForm>;
	messages: { error: string; successDisable: string; successEnable: string };
	onSave: (
		input: { enabled: boolean } & TForm
	) => Promise<{ enabled: boolean } & TForm>;
	onSaved: () => void;
	switchLabel: string;
	title: string;
	turnOffLabel: string;
}

function BillingRow<TForm extends FormShape>({
	initial,
	defaults,
	limits,
	icon,
	title,
	description,
	switchLabel,
	turnOffLabel,
	messages,
	onSave,
	canEdit,
	onSaved,
	children,
}: BillingRowProps<TForm>) {
	const wasEnabled = initial?.enabled ?? false;
	const initialForm = useMemo(() => {
		const values = { ...defaults };
		if (initial) {
			for (const key of Object.keys(defaults) as (keyof TForm)[]) {
				values[key] = initial[key];
			}
		}
		return values;
	}, [initial, defaults]);

	const [enabled, setEnabled] = useState(wasEnabled);
	const [form, setFormState] = useState<TForm>(initialForm);

	useEffect(() => {
		setEnabled(wasEnabled);
		setFormState(initialForm);
	}, [wasEnabled, initialForm]);

	const mutation = useMutation({ mutationFn: onSave });
	const setForm = (patch: Partial<TForm>) =>
		setFormState((f) => ({ ...f, ...patch }));

	const dirty =
		enabled !== wasEnabled ||
		(enabled && !shallowEqualNumbers(form, initialForm));
	const invalid = enabled && !withinLimits(form, limits);

	const handleSave = () => {
		if (!canEdit) {
			return;
		}
		mutation.mutate(
			{ enabled, ...roundForm(form) },
			{
				onSuccess: () => {
					toast.success(
						enabled ? messages.successEnable : messages.successDisable
					);
					onSaved();
				},
			}
		);
	};

	const saveLabel =
		wasEnabled && !enabled
			? turnOffLabel
			: wasEnabled
				? "Save changes"
				: "Turn on";

	return (
		<section className="px-5 py-4">
			<header className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 items-start gap-3">
					<div
						className={cn(
							"flex size-9 shrink-0 items-center justify-center rounded-lg border transition-opacity duration-(--duration-quick) ease-out motion-reduce:transition-none",
							enabled
								? "border-primary/30 bg-primary/10 text-primary"
								: "border-border bg-secondary text-muted-foreground opacity-75"
						)}
					>
						{icon}
					</div>
					<div className="min-w-0 space-y-0.5">
						<Text className="text-balance" variant="label">
							{title}
						</Text>
						<Text className="text-pretty" tone="muted" variant="caption">
							{description}
						</Text>
					</div>
				</div>
				<Switch
					aria-label={switchLabel}
					checked={enabled}
					disabled={!canEdit || mutation.isPending}
					onCheckedChange={setEnabled}
				/>
			</header>

			{enabled && (
				<div className="motion-safe:fade-in motion-safe:slide-in-from-top-1 space-y-3 pt-4 motion-safe:animate-in motion-safe:duration-150">
					{children(form, setForm)}
				</div>
			)}

			{mutation.isError && (
				<p className="text-pretty pt-3 text-destructive text-sm" role="alert">
					{mutation.error.message || messages.error}
				</p>
			)}
			{dirty && (
				<div className="motion-safe:fade-in motion-safe:slide-in-from-top-1 flex justify-end pt-3 motion-safe:animate-in motion-safe:duration-150">
					<Button
						aria-label={mutation.isPending ? "Saving…" : saveLabel}
						disabled={!canEdit || invalid || mutation.isPending}
						loading={mutation.isPending}
						onClick={handleSave}
						size="sm"
						variant={wasEnabled && !enabled ? "destructive" : "secondary"}
					>
						{saveLabel}
					</Button>
				</div>
			)}
		</section>
	);
}

function LabeledNumberInput({
	id,
	label,
	helper,
	value,
	onChange,
	min,
	max,
	step,
	suffix,
}: {
	helper: string;
	id: string;
	label: string;
	max: number;
	min: number;
	onChange: (v: number) => void;
	step: number;
	suffix?: string;
	value: number;
}) {
	return (
		<Field>
			<Field.Label htmlFor={id}>{label}</Field.Label>
			<Input
				id={id}
				inputMode="numeric"
				max={max}
				min={min}
				onChange={(e) => onChange(Number(e.target.value) || 0)}
				step={step}
				suffix={suffix}
				type="number"
				value={value}
			/>
			<Field.Description>{helper}</Field.Description>
		</Field>
	);
}

function RefillSummary({ quantity }: { quantity: number }) {
	const cost = calculateTopupCost(quantity);
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 bg-secondary/40 px-3 py-2">
			<Text tone="muted" variant="caption">
				Each refill charges{" "}
				<span className="font-medium text-foreground tabular-nums">
					${cost.toFixed(2)}
				</span>{" "}
				to your card on file.
			</Text>
			<Text className="tabular-nums" tone="muted" variant="caption">
				{quantity.toLocaleString()} credits · ≈ ${(cost / quantity).toFixed(4)}
				/credit
			</Text>
		</div>
	);
}

function shallowEqualNumbers<T extends FormShape>(a: T, b: T) {
	for (const k of Object.keys(a)) {
		if (a[k] !== b[k]) {
			return false;
		}
	}
	return true;
}

function withinLimits<T extends FormShape>(form: T, limits: FormLimits<T>) {
	for (const k of Object.keys(limits) as (keyof T)[]) {
		const [min, max] = limits[k];
		if (form[k] < min || form[k] > max) {
			return false;
		}
	}
	return true;
}

function roundForm<T extends FormShape>(form: T): T {
	const out = {} as T;
	for (const k of Object.keys(form) as (keyof T)[]) {
		out[k] = Math.round(form[k]) as T[keyof T];
	}
	return out;
}

"use client";

import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	calculateTopupCost,
	TOPUP_FEATURE_ID,
	TOPUP_MAX_QUANTITY,
} from "@/lib/topup-math";
import { useMutation } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	BellIcon,
	GearIcon,
	InfinityIcon,
	ShieldCheckIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card, Divider, Input, Text } from "@databuddy/ui";
import { Switch } from "@databuddy/ui/client";

const EVENTS_FEATURE_ID = "events";

const TOPUP_DEFAULTS = { threshold: 100, quantity: 1000 };
const TOPUP_LIMITS = {
	threshold: [10, 50_000],
	quantity: [100, TOPUP_MAX_QUANTITY],
} as const;

const ALERT_DEFAULTS = { threshold: 80 };
const ALERT_LIMITS = { threshold: [1, 99] } as const;

const SPEND_DEFAULTS = { overageLimit: 50 };
const SPEND_LIMITS = { overageLimit: [1, 10_000] } as const;

const EXPAND_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function BillingControlsCard() {
	const { data: customer, refetch } = useCustomer();

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
				a.featureId === EVENTS_FEATURE_ID &&
				a.thresholdType === "usage_percentage"
		);
		return e ? { enabled: e.enabled, threshold: e.threshold } : null;
	}, [customer]);

	const spend = useMemo(() => {
		const e = customer?.billingControls?.spendLimits?.find(
			(s) => s.featureId === TOPUP_FEATURE_ID
		);
		return e && typeof e.overageLimit === "number"
			? { enabled: e.enabled, overageLimit: e.overageLimit }
			: null;
	}, [customer]);

	return (
		<Card>
			<Card.Header>
				<Card.Title className="flex items-center gap-2">
					<GearIcon
						className="text-muted-foreground"
						size={14}
						weight="duotone"
					/>
					Billing controls
				</Card.Title>
				<Card.Description>
					Guardrails for your credit balance and spend.
				</Card.Description>
			</Card.Header>
			<Card.Content className="p-0">
				<BillingRow
					actions={{
						save: "Save changes",
						turnOff: "Turn off auto top-up",
						turnOn: "Turn on",
					}}
					defaults={TOPUP_DEFAULTS}
					description="Never get cut off mid-conversation. Credits refill automatically when you run low."
					icon={<InfinityIcon size={16} weight="duotone" />}
					initial={topup}
					limits={TOPUP_LIMITS}
					messages={{
						error: "Failed to update auto top-up.",
						successDisable: "Auto top-up turned off.",
						successEnable: "Auto top-up enabled.",
					}}
					mutationOptions={orpc.billing.setAutoTopup.mutationOptions()}
					onSaved={refetch}
					switchLabel="Enable auto top-up"
					title="Auto top-up"
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
				<BillingRow
					actions={{
						save: "Save changes",
						turnOff: "Turn off alert",
						turnOn: "Turn on",
					}}
					defaults={ALERT_DEFAULTS}
					description="Get an email when your monthly event usage crosses a threshold — no more surprises."
					icon={<BellIcon size={16} weight="duotone" />}
					initial={alert}
					limits={ALERT_LIMITS}
					messages={{
						error: "Failed to update usage alert.",
						successDisable: "Usage alert turned off.",
						successEnable: "Usage alert enabled.",
					}}
					mutationOptions={orpc.billing.setUsageAlert.mutationOptions()}
					onSaved={refetch}
					switchLabel="Enable usage alert"
					title="Event usage alert"
				>
					{(form, setForm) => (
						<LabeledNumberInput
							helper={`alert when you've used this % of your monthly events (${ALERT_LIMITS.threshold[0]}–${ALERT_LIMITS.threshold[1]})`}
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
				<Divider />
				<BillingRow
					actions={{
						save: "Save changes",
						turnOff: "Remove limit",
						turnOn: "Turn on",
					}}
					defaults={SPEND_DEFAULTS}
					description="Cap how much you can spend on credits each month. Purchases stop once the cap is hit."
					icon={<ShieldCheckIcon size={16} weight="duotone" />}
					initial={spend}
					limits={SPEND_LIMITS}
					messages={{
						error: "Failed to update spend limit.",
						successDisable: "Spend limit removed.",
						successEnable: "Spend limit set.",
					}}
					mutationOptions={orpc.billing.setSpendLimit.mutationOptions()}
					onSaved={refetch}
					switchLabel="Enable spend limit"
					title="Credit spend limit"
				>
					{(form, setForm) => (
						<LabeledNumberInput
							helper={`between $${SPEND_LIMITS.overageLimit[0]} and $${SPEND_LIMITS.overageLimit[1].toLocaleString()} per month`}
							id="spend-limit"
							label="Stop spending above"
							max={SPEND_LIMITS.overageLimit[1]}
							min={SPEND_LIMITS.overageLimit[0]}
							onChange={(v) => setForm({ overageLimit: v })}
							prefix="$"
							step={10}
							suffix="USD"
							value={form.overageLimit}
						/>
					)}
				</BillingRow>
			</Card.Content>
		</Card>
	);
}

type FormShape = Record<string, number>;
type FormLimits<T extends FormShape> = {
	[K in keyof T]: readonly [number, number];
};

interface BillingRowProps<TForm extends FormShape> {
	actions: { save: string; turnOff: string; turnOn: string };
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
	mutationOptions: any;
	onSaved: () => void;
	switchLabel: string;
	title: string;
}

function BillingRow<TForm extends FormShape>({
	initial,
	defaults,
	limits,
	icon,
	title,
	description,
	switchLabel,
	actions,
	messages,
	mutationOptions,
	onSaved,
	children,
}: BillingRowProps<TForm>) {
	const wasEnabled = initial?.enabled ?? false;
	const initialForm = useMemo(
		() => (initial ? stripEnabled(initial) : defaults),
		[initial, defaults]
	);

	const [enabled, setEnabled] = useState(wasEnabled);
	const [form, setFormState] = useState<TForm>(initialForm);

	useEffect(() => {
		setEnabled(wasEnabled);
		setFormState(initialForm);
	}, [wasEnabled, initialForm]);

	const mutation = useMutation(mutationOptions) as {
		isPending: boolean;
		mutate: (
			input: { enabled: boolean } & TForm,
			options: {
				onError: (error: unknown) => void;
				onSuccess: () => void;
			}
		) => void;
	};
	const setForm = (patch: Partial<TForm>) =>
		setFormState((f) => ({ ...f, ...patch }));

	const dirty =
		enabled !== wasEnabled ||
		(enabled && !shallowEqualNumbers(form, initialForm));
	const invalid = enabled && !withinLimits(form, limits);

	const handleSave = () => {
		mutation.mutate(
			{ enabled, ...roundForm(form) } as { enabled: boolean } & TForm,
			{
				onSuccess: () => {
					toast.success(
						enabled ? messages.successEnable : messages.successDisable
					);
					onSaved();
				},
				onError: (error) => {
					toast.error(error instanceof Error ? error.message : messages.error);
				},
			}
		);
	};

	const saveLabel = mutation.isPending
		? "Saving…"
		: wasEnabled && !enabled
			? actions.turnOff
			: wasEnabled
				? actions.save
				: actions.turnOn;

	return (
		<section className="px-5 py-4">
			<header className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 items-start gap-3">
					<div
						className={cn(
							"flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
							wasEnabled
								? "border-primary/30 bg-primary/10 text-primary"
								: "border-border bg-secondary text-muted-foreground"
						)}
					>
						{icon}
					</div>
					<div className="min-w-0 space-y-0.5">
						<div className="flex items-center gap-2">
							<Text variant="label">{title}</Text>
							{wasEnabled && <Badge variant="success">On</Badge>}
						</div>
						<Text tone="muted" variant="caption">
							{description}
						</Text>
					</div>
				</div>
				<Switch
					aria-label={switchLabel}
					checked={enabled}
					onCheckedChange={setEnabled}
				/>
			</header>

			<Expand open={enabled}>
				<div className="space-y-3 pt-4">{children(form, setForm)}</div>
			</Expand>

			<Expand duration={0.18} open={dirty}>
				<div className="flex justify-end pt-3">
					<Button
						disabled={invalid || mutation.isPending}
						onClick={handleSave}
						size="sm"
						variant={wasEnabled && !enabled ? "destructive" : "secondary"}
					>
						{saveLabel}
					</Button>
				</div>
			</Expand>
		</section>
	);
}

function Expand({
	children,
	duration = 0.22,
	open,
}: {
	children: React.ReactNode;
	duration?: number;
	open: boolean;
}) {
	return (
		<AnimatePresence initial={false}>
			{open && (
				<motion.div
					animate={{ height: "auto", opacity: 1 }}
					className="overflow-y-clip overflow-x-visible"
					exit={{ height: 0, opacity: 0 }}
					initial={{ height: 0, opacity: 0 }}
					transition={{ duration, ease: EXPAND_EASE }}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
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
	prefix,
}: {
	helper: string;
	id: string;
	label: string;
	max: number;
	min: number;
	onChange: (v: number) => void;
	prefix?: string;
	step: number;
	suffix?: string;
	value: number;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="font-medium text-foreground text-xs" htmlFor={id}>
				{label}
			</label>
			<Input
				id={id}
				inputMode="numeric"
				max={max}
				min={min}
				onChange={(e) => onChange(Number(e.target.value) || 0)}
				prefix={prefix}
				step={step}
				suffix={suffix}
				type="number"
				value={value}
			/>
			<span className="text-[11px] text-muted-foreground">{helper}</span>
		</div>
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

function stripEnabled<T extends FormShape>(v: { enabled: boolean } & T): T {
	const { enabled: _e, ...rest } = v;
	return rest as unknown as T;
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

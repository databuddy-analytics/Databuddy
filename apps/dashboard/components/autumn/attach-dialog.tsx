"use client";

import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Dialog } from "@/components/ds/dialog";
import { Divider } from "@/components/ds/divider";
import { Text } from "@/components/ds/text";
import dayjs from "@/lib/dayjs";
import type { PreviewAttachResponse } from "autumn-js";
import { useState } from "react";

export interface AttachDialogProps {
	onConfirm: () => Promise<void>;
	open: boolean;
	planId: string;
	preview: PreviewAttachResponse;
	setOpen: (open: boolean) => void;
}

type PreviewLineItem = PreviewAttachResponse["lineItems"][number];
type PreviewDiscount = NonNullable<PreviewLineItem["discounts"]>[number];
type PreviewNextCycle = NonNullable<PreviewAttachResponse["nextCycle"]>;

interface DiscountableLineItem {
	discounts?: Array<{ amountOff: number; rewardName?: string }> | undefined;
	subtotal: number;
	total: number;
}

function formatMoney(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(amount);
}

function describeDiscount(
	discount: PreviewDiscount,
	appliedAmount: number,
	currency: string
): string {
	const name = discount.rewardName ?? "Discount";
	if (discount.percentOff) {
		return `${name} (${discount.percentOff}% off)`;
	}
	return `${name} (${formatMoney(appliedAmount, currency)} off)`;
}

function aggregateDiscounts(
	lineItems: DiscountableLineItem[]
): { label: string; amount: number }[] {
	const byLabel = new Map<string, number>();
	for (const item of lineItems) {
		const discountsOnItem = item.discounts ?? [];
		if (discountsOnItem.length === 0) {
			continue;
		}
		const applied = Math.max(0, item.subtotal - item.total);
		if (applied <= 0) {
			continue;
		}
		if (discountsOnItem.length === 1) {
			const label = discountsOnItem[0].rewardName ?? "Discount";
			byLabel.set(label, (byLabel.get(label) ?? 0) + applied);
			continue;
		}
		const rawTotal = discountsOnItem.reduce((sum, d) => sum + d.amountOff, 0);
		for (const d of discountsOnItem) {
			const label = d.rewardName ?? "Discount";
			const share = rawTotal > 0 ? (d.amountOff / rawTotal) * applied : 0;
			byLabel.set(label, (byLabel.get(label) ?? 0) + share);
		}
	}
	return [...byLabel.entries()].map(([label, amount]) => ({ label, amount }));
}

function NextCycleSummary({
	nextCycle,
	currency,
}: {
	nextCycle: PreviewNextCycle;
	currency: string;
}) {
	const startsAt = dayjs(nextCycle.startsAt).format("MMM D, YYYY");
	const hasDiscount = nextCycle.total < nextCycle.subtotal;
	const label =
		nextCycle.total <= 0
			? `Free on ${startsAt}`
			: `Then ${formatMoney(nextCycle.total, currency)} on ${startsAt}`;
	const discountBreakdown = aggregateDiscounts(nextCycle.lineItems);

	return (
		<div className="space-y-2 rounded border border-border/60 bg-secondary/40 px-3 py-2">
			<div className="flex items-center justify-between gap-2">
				<Text tone="muted" variant="caption">
					{label}
				</Text>
				{hasDiscount && nextCycle.subtotal > 0 && (
					<Text
						className="tabular-nums line-through"
						tone="muted"
						variant="caption"
					>
						{formatMoney(nextCycle.subtotal, currency)}
					</Text>
				)}
			</div>
			{discountBreakdown.length > 0 && (
				<div className="space-y-1 border-border/60 border-t pt-2">
					{discountBreakdown.map((d) => (
						<div
							className="flex items-center justify-between"
							key={`next-${d.label}`}
						>
							<Text tone="muted" variant="caption">
								{d.label}
							</Text>
							<Text className="text-success tabular-nums" variant="caption">
								-{formatMoney(d.amount, currency)}
							</Text>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function AttachDialog({
	open,
	setOpen,
	preview,
	onConfirm,
}: AttachDialogProps) {
	const [loading, setLoading] = useState(false);

	const { currency, lineItems, subtotal, total, nextCycle } = preview;
	const discountTotal = Math.max(0, subtotal - total);
	const discountBreakdown = aggregateDiscounts(lineItems);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Dialog.Content className="w-[95vw] max-w-md sm:w-full">
				<Dialog.Header>
					<Dialog.Title>Confirm purchase</Dialog.Title>
					<Dialog.Description>
						Review the charges before confirming.
					</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body className="space-y-4">
					<div className="space-y-2">
						{lineItems.map((item, idx) => {
							const discounts = item.discounts ?? [];
							const applied = Math.max(0, item.subtotal - item.total);
							const rawTotal = discounts.reduce(
								(sum, d) => sum + d.amountOff,
								0
							);
							return (
								<div
									className="flex items-start justify-between gap-3"
									key={`${item.planId}-${item.featureId ?? "base"}-${idx}`}
								>
									<div className="min-w-0 flex-1">
										<Text variant="label">{item.displayName}</Text>
										{item.period && (
											<Text tone="muted" variant="caption">
												{dayjs(item.period.start).format("MMM D")} –{" "}
												{dayjs(item.period.end).format("MMM D, YYYY")}
											</Text>
										)}
										{discounts.map((discount, discountIdx) => {
											const appliedShare =
												discounts.length === 1
													? applied
													: rawTotal > 0
														? (discount.amountOff / rawTotal) * applied
														: 0;
											return (
												<Badge
													className="mt-1 mr-1"
													key={`${item.planId}-d-${discountIdx}`}
													variant="success"
												>
													{describeDiscount(discount, appliedShare, currency)}
												</Badge>
											);
										})}
									</div>
									<div className="shrink-0 text-right">
										<Text className="tabular-nums" variant="label">
											{formatMoney(item.total, currency)}
										</Text>
										{item.total !== item.subtotal && (
											<Text
												className="tabular-nums line-through"
												tone="muted"
												variant="caption"
											>
												{formatMoney(item.subtotal, currency)}
											</Text>
										)}
									</div>
								</div>
							);
						})}
					</div>

					<Divider />

					<div className="space-y-1">
						<div className="flex items-center justify-between">
							<Text tone="muted" variant="caption">
								Subtotal
							</Text>
							<Text className="tabular-nums" variant="caption">
								{formatMoney(subtotal, currency)}
							</Text>
						</div>
						{discountBreakdown.map((d) => (
							<div className="flex items-center justify-between" key={d.label}>
								<Text tone="muted" variant="caption">
									{d.label}
								</Text>
								<Text className="text-success tabular-nums" variant="caption">
									-{formatMoney(d.amount, currency)}
								</Text>
							</div>
						))}
						{discountTotal > 0 && discountBreakdown.length === 0 && (
							<div className="flex items-center justify-between">
								<Text tone="muted" variant="caption">
									Discounts
								</Text>
								<Text className="text-success tabular-nums" variant="caption">
									-{formatMoney(discountTotal, currency)}
								</Text>
							</div>
						)}
						<div className="flex items-center justify-between pt-1">
							<Text variant="label">Due today</Text>
							<Text className="tabular-nums" variant="label">
								{formatMoney(total, currency)}
							</Text>
						</div>
					</div>

					{nextCycle && (
						<NextCycleSummary currency={currency} nextCycle={nextCycle} />
					)}
				</Dialog.Body>

				<Dialog.Footer>
					<Button
						className="w-full"
						loading={loading}
						onClick={async () => {
							setLoading(true);
							try {
								await onConfirm();
								setOpen(false);
							} finally {
								setLoading(false);
							}
						}}
					>
						{total > 0 ? `Pay ${formatMoney(total, currency)}` : "Confirm"}
					</Button>
				</Dialog.Footer>
				<Dialog.Close />
			</Dialog.Content>
		</Dialog>
	);
}

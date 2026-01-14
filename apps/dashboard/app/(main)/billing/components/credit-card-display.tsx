"use client";

import { CreditCardIcon, WifiHighIcon } from "@phosphor-icons/react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import type { CustomerWithPaymentMethod } from "../types/billing";

type CreditCardDisplayProps = {
	customer: CustomerWithPaymentMethod | null;
};

export function CreditCardDisplay({ customer }: CreditCardDisplayProps) {
	const [showCardDetails, setShowCardDetails] = usePersistentState<boolean>(
		"billing-card-details-visible",
		true
	);

	const paymentMethod = customer?.payment_method;
	const card = paymentMethod?.card;

	if (!card) {
		return (
			<div className="flex aspect-[1.586/1] w-full flex-col items-center justify-center rounded border border-dashed bg-background">
				<CreditCardIcon
					className="mb-2 text-muted-foreground"
					size={28}
					weight="duotone"
				/>
				<span className="text-muted-foreground text-sm">No payment method</span>
			</div>
		);
	}

	const cardHolder =
		paymentMethod?.billing_details?.name || customer?.name || "CARD HOLDER";
	const last4 = card.last4 || "****";
	const expMonth = card.exp_month?.toString().padStart(2, "0") || "00";
	const expYear = card.exp_year?.toString().slice(-2) || "00";
	const cardNumber = `•••• •••• •••• ${last4}`;
	const expiration = `${expMonth}/${expYear}`;
	const brand = (card.brand || "card").toLowerCase();

	return (
		<div className="relative aspect-[1.586/1] w-full select-none">
			{/* Card base */}
			<div
				className={cn(
					"absolute inset-0 flex flex-col justify-between overflow-hidden rounded p-4",
					"bg-[#0a0a0a]",
					"ring-1 ring-white/[0.06] ring-inset"
				)}
			>
				{/* Holographic strip */}
				<div
					className="pointer-events-none absolute top-0 right-0 h-full w-1/3 opacity-30"
					style={{
						background: `
							linear-gradient(
								115deg,
								transparent 20%,
								hsl(var(--primary) / 0.4) 35%,
								rgba(139, 92, 246, 0.3) 45%,
								rgba(6, 182, 212, 0.3) 55%,
								hsl(var(--primary) / 0.4) 65%,
								transparent 80%
							)
						`,
					}}
				/>

				{/* Top row */}
				<div className="relative z-10 flex items-start justify-between">
					<div className="flex items-center gap-2.5">
						{/* EMV Chip */}
						<div className="relative flex h-8 w-10 items-center justify-center overflow-hidden rounded-sm bg-linear-to-br from-amber-200 via-amber-300 to-amber-400 shadow-sm">
							<div className="absolute inset-0.5 rounded-[2px] bg-linear-to-br from-amber-100 to-amber-300 opacity-60" />
							<div className="relative grid h-5 w-6 grid-cols-3 grid-rows-3 gap-px">
								{Array.from({ length: 9 }).map((_, i) => (
									<div
										className="rounded-[1px] bg-amber-600/40"
										key={i.toString()}
									/>
								))}
							</div>
						</div>
						{/* Contactless */}
						<WifiHighIcon
							className="rotate-90 text-white/40"
							size={18}
							weight="bold"
						/>
					</div>
					<span className="font-mono text-[10px] text-white/40 uppercase">
						{brand}
					</span>
				</div>

				{/* Bottom content */}
				<div className="relative z-10 flex flex-col gap-3">
					{showCardDetails ? (
						<>
							<button
								aria-label="Hide card details"
								className="w-fit cursor-pointer text-left font-mono text-[15px] text-white/90 tabular-nums hover:text-white"
								onClick={() => setShowCardDetails(false)}
								type="button"
							>
								{cardNumber}
							</button>
							<div className="flex items-end justify-between">
								<div className="flex flex-col">
									<span className="text-[8px] text-white/30 uppercase">
										Card Holder
									</span>
									<p className="font-medium text-white/70 text-xs uppercase">
										{cardHolder}
									</p>
								</div>
								<div className="flex items-end gap-4">
									<div className="flex flex-col text-right">
										<span className="text-[8px] text-white/30 uppercase">
											Expires
										</span>
										<p className="font-mono text-white/70 text-xs tabular-nums">
											{expiration}
										</p>
									</div>
									<CardBrandLogo brand={brand} />
								</div>
							</div>
						</>
					) : (
						<>
							<button
								aria-label="Show card details"
								className="w-fit cursor-pointer text-left font-mono text-[15px] text-white/25 tabular-nums hover:text-white/40"
								onClick={() => setShowCardDetails(true)}
								type="button"
							>
								•••• •••• •••• ••••
							</button>
							<div className="flex items-end justify-between">
								<div className="flex flex-col">
									<span className="text-[8px] text-white/30 uppercase">
										Card Holder
									</span>
									<p className="font-medium text-white/25 text-xs uppercase">
										•••• ••••
									</p>
								</div>
								<div className="flex items-end gap-4">
									<div className="flex flex-col text-right">
										<span className="text-[8px] text-white/30 uppercase">
											Expires
										</span>
										<p className="font-mono text-white/25 text-xs tabular-nums">
											••/••
										</p>
									</div>
									<CardBrandLogo brand={brand} />
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function CardBrandLogo({ brand }: { brand: string }) {
	if (brand === "visa") {
		return (
			<div className="flex h-6 w-10 items-center justify-center font-bold text-sm text-white/80 italic">
				VISA
			</div>
		);
	}
	if (brand === "mastercard") {
		return (
			<div className="flex h-6 w-10 items-center justify-center">
				<div className="relative flex">
					<div className="size-5 rounded-full bg-[#eb001b]" />
					<div className="-ml-2.5 size-5 rounded-full bg-[#f79e1b] mix-blend-hard-light" />
				</div>
			</div>
		);
	}
	if (brand === "amex") {
		return (
			<div className="flex h-6 w-10 items-center justify-center font-bold text-[#006fcf] text-[9px]">
				AMEX
			</div>
		);
	}
	return (
		<div className="flex h-6 w-10 items-center justify-center">
			<CreditCardIcon className="text-white/50" size={18} weight="duotone" />
		</div>
	);
}

"use client";

import { motion } from "motion/react";
import { type CSSProperties, type ElementType, memo } from "react";
import { cn } from "@/lib/utils";

export interface TextShimmerProps {
	as?: ElementType;
	children: string;
	className?: string;
	duration?: number;
	spread?: number;
}

const shimmerClassName =
	"relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]";

const shimmerInitial = { backgroundPosition: "100% center" };
const shimmerAnimate = { backgroundPosition: "0% center" };

function ShimmerP({
	children,
	className,
	duration = 2,
	spread = 2,
}: Omit<TextShimmerProps, "as">) {
	const dynamicSpread = (children?.length ?? 0) * spread;
	return (
		<motion.p
			animate={shimmerAnimate}
			className={cn(shimmerClassName, className)}
			initial={shimmerInitial}
			style={
				{
					"--spread": `${dynamicSpread}px`,
					backgroundImage:
						"var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
				} as CSSProperties
			}
			transition={{
				repeat: Number.POSITIVE_INFINITY,
				duration,
				ease: "linear",
			}}
		>
			{children}
		</motion.p>
	);
}

function ShimmerSpan({
	children,
	className,
	duration = 2,
	spread = 2,
}: Omit<TextShimmerProps, "as">) {
	const dynamicSpread = (children?.length ?? 0) * spread;
	return (
		<motion.span
			animate={shimmerAnimate}
			className={cn(shimmerClassName, className)}
			initial={shimmerInitial}
			style={
				{
					"--spread": `${dynamicSpread}px`,
					backgroundImage:
						"var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
				} as CSSProperties
			}
			transition={{
				repeat: Number.POSITIVE_INFINITY,
				duration,
				ease: "linear",
			}}
		>
			{children}
		</motion.span>
	);
}

const ShimmerComponent = ({ as = "p", ...props }: TextShimmerProps) => {
	if (as === "span") {
		return <ShimmerSpan {...props} />;
	}
	return <ShimmerP {...props} />;
};

export const Shimmer = memo(ShimmerComponent);

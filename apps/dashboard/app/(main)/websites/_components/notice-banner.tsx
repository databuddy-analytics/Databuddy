import type { SVGProps } from "react";
import { cloneElement } from "react";
import { cn } from "@/lib/utils";

export const NoticeBanner = ({
	title,
	children,
	icon,
	className,
	description,
	tone = "default",
}: {
	title?: string;
	children?: React.ReactNode;
	icon: React.ReactElement<
		SVGProps<SVGSVGElement> & { size?: number | string; weight?: string }
	>;
	className?: string;
	description?: string;
	tone?: "default" | "warning";
}) => (
	<div
		className={cn(
			"flex flex-1 items-center gap-2 rounded border px-3 py-2 font-medium text-sm",
			tone === "default"
				? "notice-banner-angled-rectangle-gradient border-border bg-accent text-accent-foreground"
				: "border-border border-l-2 border-l-amber-500/70 bg-card text-foreground shadow-xs",
			className
		)}
	>
		<div className="flex w-full flex-wrap items-center justify-between gap-5">
			{description || title || icon ? (
				<div className="flex flex-1 items-center gap-2">
					{icon
						? cloneElement(icon, {
								...icon.props,
								className: cn(
									"shrink-0",
									tone === "default"
										? "text-accent-foreground"
										: "text-amber-500",
									icon.props.className
								),
								"aria-hidden": true,
								weight: "fill",
								size: 20,
							})
						: null}
					<div className="flex flex-1 flex-col gap-0.5">
						{title ? (
							<h3
								className={cn(
									"text-balance font-medium text-sm",
									tone === "default"
										? "text-accent-foreground"
										: "text-foreground"
								)}
							>
								{title}
							</h3>
						) : null}
						{description ? (
							<p
								className={cn(
									"text-pretty text-xs",
									tone === "default"
										? "text-accent-foreground/90"
										: "text-muted-foreground"
								)}
							>
								{description}
							</p>
						) : null}
					</div>
				</div>
			) : null}
			{children ? children : null}
		</div>
	</div>
);

import type { IconProps } from "@phosphor-icons/react";
import { cloneElement } from "react";
import { cn } from "@/lib/utils";

export const NoticeBanner = ({
	title,
	children,
	icon,
	className,
	description,
}: {
	title?: string;
	children?: React.ReactNode;
	icon: React.ReactElement<IconProps>;
	className?: string;
	description?: string;
}) => (
	<div
		className={cn(
			"notice-banner-angled-rectangle-gradient flex flex-1 items-center gap-2 rounded-lg border border-accent-foreground bg-accent-foreground/80 px-3 py-2 font-medium text-accent-brighter text-sm",
			className
		)}
	>
		<div className="flex w-full flex-wrap items-center justify-between gap-5">
			{(description || title || icon) && (
				<div className="flex flex-1 items-center gap-2">
					{icon &&
						cloneElement(icon, {
							...icon.props,
							className: cn("text-accent", icon.props.className),
							"aria-hidden": true,
							weight: "fill",
							size: 20,
						})}
					<div className="flex flex-1 flex-col">
						{title && (
							<h3 className="font-medium text-accent-brighter text-sm">
								{title}
							</h3>
						)}
						{description && (
							<p className="text-nowrap text-accent-brighter/80 text-xs">
								{description}
							</p>
						)}
					</div>
				</div>
			)}
			{children}
		</div>
	</div>
);

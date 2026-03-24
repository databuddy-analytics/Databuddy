import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
	icon: React.ComponentType<{ size?: number; weight?: "duotone" | "fill" }>;
	title: string;
	badge?: number | boolean;
	isExpanded: boolean;
	onToggleAction: () => void;
	children: React.ReactNode;
}

export function CollapsibleSection({
	icon: Icon,
	title,
	badge,
	isExpanded,
	onToggleAction,
	children,
}: CollapsibleSectionProps) {
	const showBadge =
		badge !== undefined && (typeof badge === "boolean" ? badge : badge > 0);

	return (
		<div className="space-y-2">
			<div className="-mx-3">
				<button
					aria-expanded={isExpanded}
					className="group flex w-full cursor-pointer items-center justify-between rounded px-3 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					onClick={onToggleAction}
					type="button"
				>
					<div className="flex items-center gap-2.5">
						<Icon aria-hidden="true" size={16} weight="duotone" />
						<span className="font-medium text-sm">{title}</span>
						{showBadge && (
							<span className="flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
								<span className="sr-only">
									{typeof badge === "boolean" ? "enabled" : `${badge} items`}
								</span>
								<span aria-hidden="true">
									{typeof badge === "boolean" ? "✓" : badge}
								</span>
							</span>
						)}
					</div>
					<CaretDownIcon
						aria-hidden="true"
						className={cn(
							"size-4 text-muted-foreground transition-transform duration-200",
							isExpanded && "rotate-180"
						)}
						weight="fill"
					/>
				</button>
			</div>

			<div
				className={cn(
					"grid transition-all duration-200 ease-in-out",
					isExpanded
						? "grid-rows-[1fr] opacity-100"
						: "grid-rows-[0fr] opacity-0"
				)}
			>
				<div className="overflow-hidden">
					<div className="pb-4">{children}</div>
				</div>
			</div>
		</div>
	);
}

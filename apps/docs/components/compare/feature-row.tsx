import { CheckIcon, XMarkIcon as XIcon } from "@databuddy/ui/icons";
import type { ComparisonFeature } from "@/lib/comparison-config";

export function FeatureRow({
	feature,
	competitorName,
}: {
	feature: ComparisonFeature;
	competitorName: string;
}) {
	return (
		<div className="border-border/50 border-b transition-colors last:border-b-0 hover:bg-muted/20">
			<div className="hidden grid-cols-[1fr_100px_100px_1fr] items-center gap-4 px-6 py-4 md:grid">
				<span className="font-medium text-foreground text-sm">
					{feature.name}
				</span>
				<span className="flex justify-center">
					{feature.databuddy ? (
						<CheckIcon className="size-4 text-primary" weight="bold" />
					) : (
						<XIcon className="size-4 text-muted-foreground/50" weight="bold" />
					)}
				</span>
				<span className="flex justify-center">
					{feature.competitor ? (
						<CheckIcon className="size-4 text-muted-foreground" weight="bold" />
					) : (
						<XIcon className="size-4 text-muted-foreground/50" weight="bold" />
					)}
				</span>
				<span className="text-muted-foreground text-sm">{feature.benefit}</span>
			</div>

			<div className="flex items-start justify-between gap-4 px-5 py-4 md:hidden">
				<div className="flex-1 space-y-1">
					<span className="block font-medium text-foreground text-sm">
						{feature.name}
					</span>
					<span className="block text-muted-foreground text-xs leading-relaxed">
						{feature.benefit}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-3 pt-0.5">
					<div className="flex flex-col items-center gap-0.5">
						{feature.databuddy ? (
							<CheckIcon className="size-4 text-primary" weight="bold" />
						) : (
							<XIcon
								className="size-4 text-muted-foreground/50"
								weight="bold"
							/>
						)}
						<span className="text-[10px] text-muted-foreground">DB</span>
					</div>
					<div className="flex flex-col items-center gap-0.5">
						{feature.competitor ? (
							<CheckIcon
								className="size-4 text-muted-foreground"
								weight="bold"
							/>
						) : (
							<XIcon
								className="size-4 text-muted-foreground/50"
								weight="bold"
							/>
						)}
						<span className="text-[10px] text-muted-foreground">
							{competitorName.split(" ").at(0)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

import type { ChartBarIcon } from "@databuddy/ui/icons";

interface ChartTypeOptionProps {
	icon: typeof ChartBarIcon;
	label: string;
}

export function ChartTypeOption({ icon: Icon, label }: ChartTypeOptionProps) {
	return (
		<span className="flex items-center gap-2">
			<Icon className="size-3.5 shrink-0" weight="duotone" />
			{label}
		</span>
	);
}

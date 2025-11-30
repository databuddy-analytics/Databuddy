import type { IconProps } from "@phosphor-icons/react";
import { cloneElement, type ReactElement } from "react";

type TableEmptyStateProps = {
	icon: ReactElement<IconProps>;
	title: string;
	description: string;
};

export function TableEmptyState({
	icon,
	title,
	description,
}: TableEmptyStateProps) {
	return (
		<div className="flex h-full items-center justify-center p-8">
			<div className="flex max-w-md flex-col items-center text-center">
				<div className="flex size-12 items-center justify-center rounded-2xl bg-accent-foreground">
					{cloneElement(icon, { className: "size-6 text-accent" })}
				</div>
				<h3 className="mt-5 mb-0.5 font-medium text-base">{title}</h3>
				<p className="text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
			</div>
		</div>
	);
}

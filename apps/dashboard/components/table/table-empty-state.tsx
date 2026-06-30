import type { ReactElement, SVGProps } from "react";
import { EmptyState } from "@databuddy/ui";

interface TableEmptyStateProps {
	description: string;
	icon: ReactElement<
		SVGProps<SVGSVGElement> & { size?: number | string; weight?: string }
	>;
	title: string;
}

export function TableEmptyState({
	icon,
	title,
	description,
}: TableEmptyStateProps) {
	return <EmptyState description={description} icon={icon} title={title} />;
}

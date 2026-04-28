import type React from "react";
import { cn } from "@/lib/utils";

const Section = ({
	className,
	id,
	customPaddings,
	children,
}: {
	className?: string;
	id: string;
	customPaddings?: boolean;
	children: React.ReactNode;
}) => (
	<div
		className={cn(
			"relative w-full",
			!customPaddings && "py-12 sm:py-16 lg:py-24 xl:py-32",
			className
		)}
		id={id}
	>
		<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-40" />
		{children}
	</div>
);

export default Section;

import { Branding } from "@/components/logo/branding";
import { cn } from "@/lib/utils";

export interface SectionBrandOverlayProps {
	className?: string;
	/** Corner overlay vs inline (e.g. chart card header). */
	layout?: "overlay" | "inline";
	/** When `layout` is `overlay`: horizontal corner. */
	position?: "start" | "end";
}

export function SectionBrandOverlay({
	className,
	layout = "overlay",
	position = "end",
}: SectionBrandOverlayProps) {
	if (layout === "inline") {
		return (
			<div
				aria-hidden
				className={cn(
					"inline-flex shrink-0 items-center opacity-60",
					className
				)}
			>
				<Branding heightPx={24} variant="primary-logo" />
			</div>
		);
	}

	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none absolute bottom-2 z-10 inline-flex items-center opacity-60",
				position === "end" ? "inset-e-2" : "inset-s-2",
				className
			)}
		>
			<Branding heightPx={24} variant="primary-logo" />
		</div>
	);
}

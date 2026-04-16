import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

export interface MigrationCtaSectionProps {
	guideHref: string;
	guideLabel: string;
	heading: string;
	steps: string[];
}

export function MigrationCtaSection({
	heading,
	steps,
	guideHref,
	guideLabel,
}: MigrationCtaSectionProps) {
	return (
		<section
			aria-labelledby="migration-cta-heading"
			className="rounded border border-border bg-foreground/3 p-6 sm:p-8"
		>
			<h2
				className="mb-4 text-balance font-semibold text-foreground text-xl sm:text-2xl"
				id="migration-cta-heading"
			>
				{heading}
			</h2>
			<ol className="mb-6 list-decimal space-y-2 text-pretty pl-5 text-muted-foreground text-sm sm:text-base">
				{steps.map((step) => (
					<li key={step}>{step}</li>
				))}
			</ol>
			<Link
				className="group inline-flex items-center gap-2 font-medium text-foreground text-sm transition-colors hover:text-foreground/90 sm:text-base"
				href={guideHref}
			>
				{guideLabel}
				<ArrowRightIcon
					className="size-4 transition-transform group-hover:translate-x-0.5"
					weight="fill"
				/>
			</Link>
		</section>
	);
}

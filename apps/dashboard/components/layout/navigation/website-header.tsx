import type { Website } from '@databuddy/shared';
import { CaretLeftIcon, PlanetIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { FaviconImage } from '@/components/analytics/favicon-image';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface WebsiteHeaderProps {
	website: Website | null | undefined;
}

export function WebsiteHeader({ website }: WebsiteHeaderProps) {
	return (
		<div className="space-y-3">
			{/* Back button */}
			<Button
				asChild
				className="group w-full justify-start text-muted-foreground hover:text-foreground"
				size="sm"
				variant="ghost"
			>
				<Link href="/websites">
					<CaretLeftIcon
						className="group-hover:-translate-x-0.5 mr-2 h-4 w-4 transition-transform"
						size={32}
						weight="fill"
					/>
					Back to Websites
				</Link>
			</Button>

			{/* Website info card */}
			<div className="rounded-lg border bg-card p-3 py-2">
				<div className="flex items-center gap-3">
					<FaviconImage
						altText={`${website?.name || website?.domain || 'Website'} favicon`}
						className="flex-shrink-0"
						domain={website?.domain || ''}
						fallbackIcon={
							<PlanetIcon
								className="text-primary/70"
								size={20}
								weight="duotone"
							/>
						}
						size={20}
					/>
					<div className="min-w-0 flex-1">
						<h2 className="truncate font-semibold text-sm">
							{website?.name || website?.domain || (
								<Skeleton className="h-4 w-32" />
							)}
						</h2>
						{website?.domain ? (
							<p className="truncate text-muted-foreground text-xs">
								{website.domain}
							</p>
						) : (
							<div className="h-3 w-24">
								<Skeleton className="h-3 w-24" />
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

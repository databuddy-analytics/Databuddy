'use client';

import type { QueryBuilderMeta } from '@databuddy/shared';
import { CaretRightIcon } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
import { QueryTypeDialog } from './query-type-dialog';

export interface QueryTypeItem {
	name: string;
	config: {
		customizable?: boolean;
		defaultLimit?: number;
		allowedFilters?: string[];
		meta?: QueryBuilderMeta;
	};
}

export function QueryTypesGrid({ items }: { items: QueryTypeItem[] }) {
	return (
		<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
			{items.map(({ name, config }) => {
				const filters = config.allowedFilters ?? [];
				const visibleFilters = filters.slice(0, 3);
				const extra = filters.length - visibleFilters.length;
				const tags = config.meta?.tags?.slice(0, 2) ?? [];

				return (
					<QueryTypeDialog
						allowedFilters={config.allowedFilters}
						customizable={config.customizable}
						defaultLimit={config.defaultLimit}
						key={name}
						meta={config.meta}
						typeKey={name}
					>
						<Card
							aria-label={`View details for ${name}`}
							className="group hover:-translate-y-0.5 relative cursor-pointer rounded border-border/60 bg-card/80 transition-all hover:shadow-md"
						>
							<CardContent className="p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<code className="truncate font-medium font-mono text-sm">
												{name}
											</code>
											{config.customizable ? (
												<span className="rounded border px-1.5 py-0.5 text-xs">
													Customizable
												</span>
											) : null}
										</div>
										{config.meta?.category ? (
											<div className="mt-1 text-muted-foreground text-xs">
												<span className="font-medium">Category:</span>{' '}
												{config.meta.category}
											</div>
										) : null}
									</div>
									<CaretRightIcon
										className="mt-0.5 hidden h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
										weight="fill"
									/>
								</div>

								{tags.length ? (
									<div className="mt-2 flex flex-wrap gap-1.5">
										{tags.map((t) => (
											<span
												className="rounded bg-muted px-1.5 py-0.5 text-xs"
												key={t}
											>
												{t}
											</span>
										))}
									</div>
								) : null}

								<div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
									{visibleFilters.map((f) => (
										<code
											className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
											key={f}
										>
											{f}
										</code>
									))}
									{extra > 0 ? (
										<span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
											+{extra} more
										</span>
									) : null}
									{typeof config.defaultLimit === 'number' ? (
										<span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80">
											Limit {config.defaultLimit}
										</span>
									) : null}
								</div>
							</CardContent>
							<div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-primary/70 to-primary/30 opacity-80" />
						</Card>
					</QueryTypeDialog>
				);
			})}
		</div>
	);
}

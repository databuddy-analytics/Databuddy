'use client';

import type { QueryBuilderMeta } from '@databuddy/shared';
import { CheckCircleIcon, CopyIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

interface Props {
	typeKey: string;
	customizable?: boolean;
	defaultLimit?: number;
	allowedFilters?: string[];
	meta?: QueryBuilderMeta;
	children: React.ReactNode; // trigger content
}

function DetailRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="font-semibold text-foreground text-sm">{label}</div>
			<div className="text-muted-foreground text-sm">{children}</div>
		</div>
	);
}

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded border bg-muted px-2 py-1 font-medium text-muted-foreground text-xs">
			{children}
		</span>
	);
}

function UsageSection({ typeKey }: { typeKey: string }) {
	const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.databuddy.cc';
	const snippetCopy = `curl -sS -X POST '${baseUrl}/v1/query?website_id=YOUR_WEBSITE_ID' -H 'Content-Type: application/json' -H 'X-Api-Key: YOUR_API_KEY' -d '{"id":"example","parameters":["${typeKey}"],"limit":100}'`;
	const snippetDisplay = `curl -X POST "${baseUrl}/v1/query?website_id=YOUR_WEBSITE_ID" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Api-Key: YOUR_API_KEY" \\\n  -d '{\n  "id": "example",\n  "parameters": ["${typeKey}"],\n  "limit": 100\n}'`;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold text-foreground text-sm">Usage Example</h3>
				<CopyButton text={snippetCopy} />
			</div>
			<div className="overflow-hidden rounded border bg-muted">
				<div className="p-4">
					<pre className="overflow-x-auto text-foreground text-xs leading-relaxed">
						{snippetDisplay}
					</pre>
				</div>
			</div>
		</div>
	);
}

function OutputFieldsTable({ meta }: { meta?: QueryBuilderMeta }) {
	if (!meta?.output_fields?.length) {
		return null;
	}
	return (
		<div className="space-y-4">
			<h3 className="font-semibold text-foreground text-sm">Output Fields</h3>

			{/* Mobile: Card Layout */}
			<div className="space-y-3 sm:hidden">
				{meta.output_fields.map((field) => (
					<div className="rounded border bg-card p-4" key={field.name}>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<code className="rounded bg-muted px-2 py-1 font-medium font-mono text-xs">
									{field.name}
								</code>
								<span className="rounded border bg-background px-2 py-1 font-medium text-xs capitalize">
									{field.type}
								</span>
							</div>
							{field.label && (
								<div className="text-sm">
									<span className="text-muted-foreground">Label:</span>{' '}
									{field.label}
								</div>
							)}
							{field.description && (
								<div className="text-sm">
									<span className="text-muted-foreground">Description:</span>{' '}
									{field.description}
								</div>
							)}
							{field.unit && (
								<div className="text-sm">
									<span className="text-muted-foreground">Unit:</span>{' '}
									{field.unit}
								</div>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Desktop: Table Layout */}
			<div className="hidden sm:block">
				<div className="overflow-hidden rounded border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="font-semibold">Name</TableHead>
								<TableHead className="font-semibold">Type</TableHead>
								<TableHead className="font-semibold">Label</TableHead>
								<TableHead className="font-semibold">Description</TableHead>
								<TableHead className="font-semibold">Unit</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{meta.output_fields.map((field) => (
								<TableRow key={field.name}>
									<TableCell>
										<code className="rounded bg-muted px-2 py-1 font-medium font-mono text-xs">
											{field.name}
										</code>
									</TableCell>
									<TableCell>
										<span className="rounded border bg-background px-2 py-1 font-medium text-xs capitalize">
											{field.type}
										</span>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{field.label || '-'}
									</TableCell>
									<TableCell className="max-w-[20rem] text-muted-foreground">
										<div className="truncate" title={field.description}>
											{field.description || '-'}
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{field.unit || '-'}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}

export function QueryTypeDialog({
	typeKey,
	customizable,
	defaultLimit,
	allowedFilters,
	meta,
	children,
}: Props) {
	return (
		<Sheet>
			<SheetTrigger asChild>{children}</SheetTrigger>
			<SheetContent className="w-full overflow-hidden sm:max-w-2xl">
				<div className="flex h-full flex-col">
					<SheetHeader className="shrink-0 border-border border-b pb-6">
						<SheetTitle className="flex flex-wrap items-center gap-2">
							<code className="rounded border bg-primary px-2.5 py-1.5 font-medium font-mono text-primary-foreground text-sm">
								{typeKey}
							</code>
							{meta?.title && (
								<span className="text-lg text-muted-foreground">
									{meta.title}
								</span>
							)}
						</SheetTitle>
						{meta?.description && (
							<SheetDescription className="text-left text-muted-foreground">
								{meta.description}
							</SheetDescription>
						)}
					</SheetHeader>

					<ScrollArea className="flex-1">
						<div className="space-y-8 py-6">
							{/* Quick Info Section */}
							<div className="rounded border bg-card p-6">
								<div className="space-y-4">
									<h3 className="font-semibold text-foreground">Quick Info</h3>
									<div className="flex flex-wrap gap-2">
										{customizable && (
											<Badge
												className="border-primary bg-primary text-primary-foreground"
												variant="outline"
											>
												Customizable
											</Badge>
										)}
										{typeof defaultLimit === 'number' && (
											<Badge variant="secondary">
												Default limit: {defaultLimit.toLocaleString()}
											</Badge>
										)}
										{meta?.category && (
											<Badge variant="outline">{meta.category}</Badge>
										)}
									</div>
								</div>
							</div>

							{/* Configuration Section */}
							{(allowedFilters?.length ||
								meta?.supports_granularity?.length ||
								meta?.tags?.length) && (
								<div className="rounded border bg-muted p-6">
									<div className="space-y-6">
										<h3 className="font-semibold text-foreground">
											Configuration
										</h3>

										<div className="grid gap-6 sm:grid-cols-2">
											{allowedFilters?.length && (
												<DetailRow label="Allowed Filters">
													<div className="flex flex-wrap gap-1.5">
														{allowedFilters.map((filter) => (
															<code
																className="rounded border bg-background px-2 py-1 font-mono text-xs"
																key={filter}
															>
																{filter}
															</code>
														))}
													</div>
												</DetailRow>
											)}

											{meta?.supports_granularity?.length && (
												<DetailRow label="Granularity Support">
													<div className="text-muted-foreground">
														{meta.supports_granularity.join(', ')}
													</div>
												</DetailRow>
											)}
										</div>

										{meta?.tags?.length && (
											<DetailRow label="Tags">
												<div className="flex flex-wrap gap-2">
													{meta.tags.map((tag) => (
														<Chip key={tag}>{tag}</Chip>
													))}
												</div>
											</DetailRow>
										)}
									</div>
								</div>
							)}

							{/* Usage Example Section */}
							<div className="rounded border bg-card p-6">
								<UsageSection typeKey={typeKey} />
							</div>

							{/* Output Fields Section */}
							{meta?.output_fields?.length && (
								<div className="rounded border bg-muted p-6">
									<OutputFieldsTable meta={meta} />
								</div>
							)}
						</div>
					</ScrollArea>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) {
			return;
		}
		const id = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(id);
	}, [copied]);

	return (
		<Button
			className={
				copied
					? 'border-green-500 bg-green-100 text-green-600 hover:bg-green-200'
					: 'border-border bg-background hover:bg-muted'
			}
			onClick={() => {
				navigator.clipboard
					.writeText(text)
					.then(() => setCopied(true))
					.catch(() => setCopied(false));
			}}
			size="sm"
			type="button"
			variant={copied ? 'secondary' : 'outline'}
		>
			{copied ? (
				<span className="inline-flex items-center gap-1.5">
					<CheckCircleIcon className="size-4" weight="duotone" />
					<span className="font-medium text-sm">Copied!</span>
				</span>
			) : (
				<span className="inline-flex items-center gap-1.5">
					<CopyIcon className="size-4" weight="duotone" />
					<span className="font-medium text-sm">Copy</span>
				</span>
			)}
		</Button>
	);
}

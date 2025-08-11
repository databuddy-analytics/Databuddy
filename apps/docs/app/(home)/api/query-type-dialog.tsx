'use client';

import type { QueryBuilderMeta } from '@databuddy/shared';
import { CheckCircleIcon, CopyIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
		<div className="text-sm">
			<div className="font-medium">{label}</div>
			<div className="pt-1 text-foreground/90">{children}</div>
		</div>
	);
}

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</span>
	);
}

function UsageSection({ typeKey }: { typeKey: string }) {
	const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.databuddy.cc';
	const snippetCopy = `curl -sS -X POST '${baseUrl}/v1/query?website_id=YOUR_WEBSITE_ID' -H 'Content-Type: application/json' -H 'X-Api-Key: YOUR_API_KEY' -d '{"id":"example","parameters":["${typeKey}"],"limit":100}'`;
	const snippetDisplay = `curl -X POST "${baseUrl}/v1/query?website_id=YOUR_WEBSITE_ID" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Api-Key: YOUR_API_KEY" \\\n  -d '{\n  "id": "example",\n  "parameters": ["${typeKey}"],\n  "limit": 100\n}'`;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="font-medium text-sm">Usage</div>
				<CopyButton text={snippetCopy} />
			</div>
			<div className="rounded border bg-muted/50 p-2 sm:p-3">
				<pre className="overflow-x-auto text-[11px] sm:text-xs">
					{snippetDisplay}
				</pre>
			</div>
		</div>
	);
}

function OutputFieldsTable({ meta }: { meta?: QueryBuilderMeta }) {
	if (!meta?.output_fields?.length) {
		return null;
	}
	return (
		<div className="hidden sm:block">
			<div className="mb-2 font-medium text-sm">Output fields</div>
			<Table className="min-w-[640px] sm:min-w-[760px]">
				<TableHeader>
					<TableRow>
						<TableHead>name</TableHead>
						<TableHead>type</TableHead>
						<TableHead>label</TableHead>
						<TableHead>description</TableHead>
						<TableHead>unit</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{meta.output_fields.map((f) => (
						<TableRow key={f.name}>
							<TableCell>
								<code className="font-mono text-xs">{f.name}</code>
							</TableCell>
							<TableCell className="capitalize">{f.type}</TableCell>
							<TableCell>{f.label || '-'}</TableCell>
							<TableCell className="max-w-[40rem] truncate">
								{f.description || '-'}
							</TableCell>
							<TableCell>{f.unit || ''}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
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
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-3xl md:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
							{typeKey}
						</code>
						{meta?.title ? (
							<span className="ml-2 text-foreground/80">{meta.title}</span>
						) : null}
					</DialogTitle>
					{meta?.description ? (
						<DialogDescription>{meta.description}</DialogDescription>
					) : null}
				</DialogHeader>

				<ScrollArea className="max-h-[65vh] sm:max-h-[75vh]">
					<div className="space-y-5 pr-3 sm:space-y-6 sm:pr-4">
						<div className="flex flex-wrap items-center gap-2">
							{customizable ? (
								<Badge variant="outline">Customizable</Badge>
							) : null}
							{typeof defaultLimit === 'number' ? (
								<Badge variant="secondary">Default limit: {defaultLimit}</Badge>
							) : null}
						</div>

						{allowedFilters && allowedFilters.length > 0 ? (
							<div>
								<div className="mb-2 font-medium text-sm">Allowed filters</div>
								<div className="flex flex-wrap gap-1.5">
									{allowedFilters.map((f) => (
										<code
											className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
											key={f}
										>
											{f}
										</code>
									))}
								</div>
							</div>
						) : null}

						{meta?.supports_granularity?.length ? (
							<div className="text-sm">
								<span className="font-medium">Granularity:</span>{' '}
								{meta.supports_granularity.join(', ')}
							</div>
						) : null}

						<div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
							<div className="space-y-3">
								{meta?.supports_granularity?.length ? (
									<DetailRow label="Granularity">
										{meta.supports_granularity.join(', ')}
									</DetailRow>
								) : null}

								{typeof defaultLimit === 'number' ? (
									<DetailRow label="Default limit">{defaultLimit}</DetailRow>
								) : null}

								{meta?.category ? (
									<DetailRow label="Category">{meta.category}</DetailRow>
								) : null}

								{meta?.tags?.length ? (
									<DetailRow label="Tags">
										<div className="flex flex-wrap gap-1.5">
											{meta.tags.map((tag) => (
												<Chip key={tag}>{tag}</Chip>
											))}
										</div>
									</DetailRow>
								) : null}

								{allowedFilters && allowedFilters.length > 0 ? (
									<DetailRow label="Allowed filters">
										<div className="flex flex-wrap gap-1.5">
											{allowedFilters.map((f) => (
												<code
													className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
													key={f}
												>
													{f}
												</code>
											))}
										</div>
									</DetailRow>
								) : null}
							</div>

							<UsageSection typeKey={typeKey} />
						</div>

						<OutputFieldsTable meta={meta} />
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
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
				<span className="inline-flex items-center gap-1">
					<CheckCircleIcon className="size-4" weight="duotone" /> Copied
				</span>
			) : (
				<span className="inline-flex items-center gap-1">
					<CopyIcon className="size-4" weight="duotone" /> Copy
				</span>
			)}
		</Button>
	);
}

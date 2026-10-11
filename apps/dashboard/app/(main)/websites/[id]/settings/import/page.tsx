"use client";

import {
	IMPORT_PROVIDERS,
	readImportFile,
	summarizeImport,
} from "@databuddy/shared/import";
import {
	batchImportRecords,
	ImportFileError,
	UnrecognizedImportFileError,
} from "@databuddy/shared/import/records";
import {
	Button,
	Card,
	Field,
	Input,
	Progress,
	Skeleton,
	Spinner,
} from "@databuddy/ui";
import { FileDrop, Switch } from "@databuddy/ui/client";
import {
	ArrowRightIcon,
	CheckCircleIcon,
	CircleInfoIcon,
	DatabaseIcon,
	FileTextIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

const PROVIDERS_WITH_LOGOS = new Set([
	"plausible",
	"posthog",
	"simple-analytics",
]);
const MONOCHROME_LOGOS = new Set(["posthog"]);
const IMPORT_FAILED = "The import stopped before it finished.";
const UNREADABLE_FILE = "This file could not be read. Try exporting it again.";
const ACCEPTED_FILES = ".zip,.csv,.jsonl,.ndjson,.json";

interface ImportProgress {
	batches: number;
	rows: number;
	totalBatches: number;
}

function formatDay(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

function formatSize(bytes: number): string {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

function IconTile({ children }: { children: ReactNode }) {
	return (
		<div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
			{children}
		</div>
	);
}

function ProviderLogo({ id }: { id: string }) {
	return (
		<IconTile>
			{PROVIDERS_WITH_LOGOS.has(id) ? (
				<Image
					alt=""
					className={MONOCHROME_LOGOS.has(id) ? "dark:invert" : undefined}
					height={18}
					src={`/providers/${id}.svg`}
					unoptimized
					width={18}
				/>
			) : (
				<DatabaseIcon className="size-4" />
			)}
		</IconTile>
	);
}

function ExportGuide({ title }: { title: string }) {
	return (
		<div className="space-y-2">
			<p className="font-medium text-sm">{title}</p>
			<ul className="divide-y rounded-md border">
				{IMPORT_PROVIDERS.map((provider) => (
					<li className="flex items-start gap-3 p-3" key={provider.id}>
						<ProviderLogo id={provider.id} />
						<div className="min-w-0">
							<p className="font-medium text-sm">{provider.label}</p>
							<p className="text-pretty text-muted-foreground text-xs">
								{provider.exportHelp}
							</p>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

export default function ImportPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const { data: websiteData } = useWebsite(websiteId);

	const [file, setFile] = useState<File | null>(null);
	const [timezone, setTimezone] = useState(browserTimeZone);
	const [replaceExisting, setReplaceExisting] = useState(false);
	const [progress, setProgress] = useState<ImportProgress | null>(null);

	const preview = useQuery({
		queryKey: [
			"import-preview",
			websiteId,
			file?.name,
			file?.size,
			file?.lastModified,
		],
		enabled: Boolean(file && websiteData),
		meta: { suppressGlobalErrorToast: true },
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			if (!(file && websiteData)) {
				return null;
			}
			const runId = crypto.randomUUID();
			const contents = await readImportFile(file, {
				domain: websiteData.domain,
				runId,
				timezone,
				websiteId,
			});
			const summary = summarizeImport(contents.records);
			if (!summary) {
				throw new ImportFileError(
					"This export has no pageviews in it. Check that it covers a period with traffic."
				);
			}
			return { ...contents, runId, summary };
		},
	});
	const ready = preview.data ?? null;

	const runImport = useMutation({
		meta: { suppressGlobalErrorToast: true },
		mutationFn: async () => {
			if (!ready) {
				return;
			}
			const { runId } = ready;
			const batches = batchImportRecords(ready.records);

			let rows = 0;
			const totalBatches = batches.length;
			setProgress({ batches: 0, rows, totalBatches });
			for (const [index, batch] of batches.entries()) {
				const result = await orpc.imports.ingest.call({
					websiteId,
					providerId: ready.provider.id,
					runId,
					timezone,
					records: batch,
				});
				rows += result.rows;
				setProgress({ batches: index + 1, rows, totalBatches });
			}
			await orpc.imports.finish.call({
				websiteId,
				providerId: ready.provider.id,
				runId,
				replaceExisting,
				rows,
			});
		},
		onMutate: () => setProgress(null),
	});

	const checking = preview.isFetching;
	const unrecognized = preview.error instanceof UnrecognizedImportFileError;
	const fileError = preview.error
		? preview.error instanceof ImportFileError
			? preview.error.message
			: UNREADABLE_FILE
		: null;
	const importError = runImport.error
		? runImport.error instanceof ImportFileError
			? runImport.error.message
			: getUserFacingErrorMessage(runImport.error, IMPORT_FAILED)
		: null;

	const chooseFile = (next: File) => {
		runImport.reset();
		setProgress(null);
		setFile(next);
	};

	if (!websiteData) {
		return (
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-4xl space-y-6 p-5">
					<Skeleton className="h-64 w-full rounded" />
				</div>
			</div>
		);
	}

	const summary = checking ? null : ready?.summary;
	const stats = summary
		? [
				{
					label: "Period",
					value:
						summary.firstDate === summary.lastDate
							? formatDay(summary.firstDate)
							: `${formatDay(summary.firstDate)} to ${formatDay(summary.lastDate)}`,
				},
				{ label: "Visitors", value: summary.visitors.toLocaleString() },
				{ label: "Pageviews", value: summary.pageviews.toLocaleString() },
			]
		: [];
	const fileStatus = checking
		? "Checking the file"
		: fileError
			? "Can't import this file"
			: ready
				? `${ready.format.label} · ${formatSize(file?.size ?? 0)}`
				: null;
	const finished = Boolean(progress) && !runImport.isPending && !importError;

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-4xl space-y-6 p-5">
				<Card>
					<Card.Header>
						<Card.Title>Import history</Card.Title>
						<Card.Description>
							Bring your history over from Plausible, PostHog or Simple
							Analytics. Days Databuddy already tracked keep their own data.
						</Card.Description>
					</Card.Header>
					<Card.Content className="space-y-5">
						{file ? (
							<FileDrop
								accept={ACCEPTED_FILES}
								disabled={runImport.isPending}
								label="Export file"
								onFileAction={chooseFile}
							>
								{({ open }) => (
									<div className="flex items-center gap-3 rounded-md border p-3">
										{ready && !checking ? (
											<ProviderLogo id={ready.provider.id} />
										) : (
											<IconTile>
												<FileTextIcon className="size-4 text-muted-foreground" />
											</IconTile>
										)}
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">
												{file.name}
											</p>
											<div
												className={cn(
													"flex items-center gap-1.5 truncate text-xs",
													fileError && !checking
														? "text-destructive"
														: "text-muted-foreground"
												)}
											>
												{checking && <Spinner size="sm" />}
												{fileStatus}
											</div>
										</div>
										<Button
											disabled={runImport.isPending}
											onClick={open}
											size="sm"
											variant="secondary"
										>
											Replace
										</Button>
									</div>
								)}
							</FileDrop>
						) : (
							<FileDrop
								accept={ACCEPTED_FILES}
								description="or click to choose a ZIP, CSV or JSON lines file"
								icon={
									<IconTile>
										<FileTextIcon className="size-5 text-muted-foreground" />
									</IconTile>
								}
								label="Export file"
								onFileAction={chooseFile}
								title="Drop your export here"
							/>
						)}

						{fileError && !checking && (
							<div
								className="flex gap-2.5 rounded-md bg-destructive/5 px-3 py-2.5"
								role="alert"
							>
								<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
								<p className="text-pretty text-sm">{fileError}</p>
							</div>
						)}

						{summary && (
							<div className="space-y-3">
								<dl className="grid grid-cols-3 divide-x rounded-md border">
									{stats.map((stat) => (
										<div className="min-w-0 px-4 py-3" key={stat.label}>
											<dt className="text-muted-foreground text-xs">
												{stat.label}
											</dt>
											<dd className="mt-1 truncate font-medium text-sm tabular-nums">
												{stat.value}
											</dd>
										</div>
									))}
								</dl>
								{ready?.format.note && (
									<p className="flex gap-2 text-pretty text-muted-foreground text-xs">
										<CircleInfoIcon className="mt-px size-3.5 shrink-0" />
										{ready.format.note}
									</p>
								)}
							</div>
						)}

						{(!file || unrecognized) && (
							<ExportGuide
								title={
									unrecognized
										? "Databuddy can import these exports"
										: "Where to find your export"
								}
							/>
						)}

						{summary && ready && (
							<div className="divide-y border-t">
								{ready.provider.grain === "rollup" && (
									<Field className="py-4">
										<Field.Label>
											Timezone in {ready.provider.label}
										</Field.Label>
										<Field.Description>
											Daily totals carry no clock time, so match the timezone
											your {ready.provider.label} site uses or days shift by
											one.
										</Field.Description>
										<Input
											className="max-w-xs"
											onChange={(event) => setTimezone(event.target.value)}
											placeholder="UTC"
											value={timezone}
										/>
									</Field>
								)}
								<div className="flex items-center justify-between gap-6 py-4">
									<div className="min-w-0">
										<p className="font-medium text-sm">
											Replace previous import
										</p>
										<p className="text-pretty text-muted-foreground text-xs">
											Removes an earlier {ready.provider.label} import once this
											one finishes. Your tracked data is never touched.
										</p>
									</div>
									<Switch
										aria-label="Replace previous import"
										checked={replaceExisting}
										onCheckedChange={setReplaceExisting}
									/>
								</div>
							</div>
						)}
					</Card.Content>
					<Card.Footer>
						<div className="flex w-full items-center justify-between gap-3">
							<p className="text-muted-foreground text-xs">
								Imported data does not count toward your billable events.
							</p>
							<Button
								aria-label="Start import"
								disabled={!summary || runImport.isPending || finished}
								loading={runImport.isPending}
								onClick={() => runImport.mutate()}
							>
								Start import
							</Button>
						</div>
					</Card.Footer>
				</Card>

				{(progress || importError) && (
					<Card>
						<Card.Header>
							<Card.Title className="flex items-center gap-2">
								{finished && (
									<CheckCircleIcon className="size-4 text-success" />
								)}
								{importError && (
									<WarningCircleIcon className="size-4 text-destructive" />
								)}
								{finished
									? "Import complete"
									: importError
										? "Import stopped"
										: "Importing"}
							</Card.Title>
							<Card.Description>
								{runImport.isPending
									? "Keep this page open until the import finishes."
									: importError
										? `${importError} ${(progress?.rows ?? 0).toLocaleString()} rows were written before it stopped.`
										: `${(progress?.rows ?? 0).toLocaleString()} rows imported. They appear in your dashboard within a minute.`}
							</Card.Description>
						</Card.Header>
						{progress && runImport.isPending && (
							<Card.Content>
								<Progress
									value={(progress.batches / progress.totalBatches) * 100}
								/>
							</Card.Content>
						)}
						{finished && (
							<Card.Footer>
								<Button asChild variant="secondary">
									<Link href={`/websites/${websiteId}`}>
										Open dashboard
										<ArrowRightIcon className="size-4" />
									</Link>
								</Button>
							</Card.Footer>
						)}
					</Card>
				)}
			</div>
		</div>
	);
}

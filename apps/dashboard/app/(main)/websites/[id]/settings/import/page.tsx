"use client";

import { Badge, Button, Card, Input, Skeleton } from "@databuddy/ui";
import { Switch } from "@databuddy/ui/client";
import {
	CheckIcon,
	DatabaseIcon,
	FileTextIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

const ACTIVE_STATES = new Set(["waiting", "active", "delayed", "prioritized"]);
const PROVIDER_LOGOS: Record<string, string> = {
	plausible: "Plausible",
	"simple-analytics": "SimpleAnalytics",
};
const GRAIN_LABEL = {
	event: "Full detail",
	rollup: "Daily totals",
} as const;
const GRAIN_HINT = {
	event: "Per-visit rows, so every breakdown is preserved.",
	rollup:
		"Daily totals. Breakdowns are accurate per day, but cannot be combined with each other.",
} as const;

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

export default function ImportPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const { data: websiteData } = useWebsite(websiteId);
	const fileInput = useRef<HTMLInputElement>(null);

	const [providerId, setProviderId] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [timezone, setTimezone] = useState(browserTimeZone);
	const [replaceExisting, setReplaceExisting] = useState(false);
	const [runId, setRunId] = useState<string | null>(null);

	const { data: providers, isLoading: providersLoading } = useQuery(
		orpc.imports.providers.queryOptions()
	);

	const { data: run } = useQuery({
		...orpc.imports.status.queryOptions({
			input: { websiteId, runId: runId ?? "" },
		}),
		enabled: Boolean(runId),
		refetchInterval: (query) =>
			ACTIVE_STATES.has(query.state.data?.state ?? "") ? 2000 : false,
	});

	const createUpload = useMutation(orpc.imports.createUpload.mutationOptions());
	const startImport = useMutation(orpc.imports.start.mutationOptions());

	const selectedProvider = providers?.find(
		(provider) => provider.id === providerId
	);

	const handleImport = useCallback(async () => {
		if (!(file && providerId)) {
			return;
		}

		try {
			const { key, uploadUrl } = await createUpload.mutateAsync({
				websiteId,
				contentLength: file.size,
				contentType: file.name.endsWith(".csv")
					? "text/csv"
					: "application/zip",
			});

			const upload = await fetch(uploadUrl, {
				method: "PUT",
				body: file,
				headers: {
					"content-type": file.name.endsWith(".csv")
						? "text/csv"
						: "application/zip",
					"content-length": String(file.size),
				},
			});
			if (!upload.ok) {
				throw new Error(`Upload failed with ${upload.status}`);
			}

			const started = await startImport.mutateAsync({
				websiteId,
				providerId,
				storageKey: key,
				replaceExisting,
				timezone,
			});
			setRunId(started.runId);
			toast.success("Import queued. This can take a few minutes.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not start the import"
			);
		}
	}, [
		file,
		providerId,
		websiteId,
		createUpload,
		startImport,
		replaceExisting,
		timezone,
	]);

	const isStarting = createUpload.isPending || startImport.isPending;
	const isRunning = ACTIVE_STATES.has(run?.state ?? "");

	if (!websiteData) {
		return (
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-4xl space-y-6 p-5">
					<Skeleton className="h-48 w-full rounded" />
					<Skeleton className="h-36 w-full rounded" />
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-4xl space-y-6 p-5">
				<Card>
					<Card.Header>
						<Card.Title>Source</Card.Title>
						<Card.Description>
							Pick the analytics tool you are importing from, then upload the
							export file it gave you.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{providersLoading ? (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<Skeleton className="h-20 w-full rounded" />
								<Skeleton className="h-20 w-full rounded" />
							</div>
						) : (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{providers?.map((provider) => {
									const isSelected = providerId === provider.id;
									return (
										<Button
											className={cn(
												"h-auto items-start justify-start gap-3 p-4 text-left",
												isSelected
													? "border-primary/50 bg-primary/5"
													: "border-border/60 hover:border-primary/30"
											)}
											key={provider.id}
											onClick={() => setProviderId(provider.id)}
											variant="outline"
										>
											<div className="flex size-8 items-center justify-center rounded border bg-secondary">
												{PROVIDER_LOGOS[provider.id] ? (
													<Image
														alt=""
														height={20}
														src={`/providers/${PROVIDER_LOGOS[provider.id]}.svg`}
														width={20}
													/>
												) : (
													<DatabaseIcon className="size-5" />
												)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="mb-1 flex items-center gap-2">
													<span className="font-medium text-sm">
														{provider.label}
													</span>
													{isSelected && (
														<CheckIcon className="size-4 text-primary" />
													)}
												</div>
												<p className="text-muted-foreground text-xs">
													{GRAIN_LABEL[provider.grain]}
												</p>
											</div>
										</Button>
									);
								})}
							</div>
						)}
					</Card.Content>
				</Card>

				{selectedProvider && (
					<Card>
						<Card.Header>
							<Card.Title>Export file</Card.Title>
							<Card.Description>
								{GRAIN_HINT[selectedProvider.grain]}
							</Card.Description>
						</Card.Header>
						<Card.Content className="space-y-4">
							{/* policy-ignore dashboard/no-raw-interactive-html: a hidden native file input is the only way to open the OS file picker; @databuddy/ui has no file input component */}
							<input
								accept=".zip,.csv"
								className="hidden"
								onChange={(event) => setFile(event.target.files?.[0] ?? null)}
								ref={fileInput}
								type="file"
							/>
							<div className="flex items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex size-8 items-center justify-center rounded border bg-secondary">
										<FileTextIcon className="size-5" />
									</div>
									<p className="truncate text-sm">
										{file ? file.name : "No file selected"}
									</p>
								</div>
								<Button
									onClick={() => fileInput.current?.click()}
									variant="outline"
								>
									Choose file
								</Button>
							</div>

							{selectedProvider.grain === "rollup" && (
								<div className="space-y-2 border-t pt-4">
									<p className="font-medium text-sm">Source time zone</p>
									<p className="text-muted-foreground text-xs">
										Daily totals have no clock time, so this must match the time
										zone configured in {selectedProvider.label} or days will
										shift by one.
									</p>
									<Input
										aria-label="Source time zone"
										onChange={(event) => setTimezone(event.target.value)}
										placeholder="UTC"
										value={timezone}
									/>
								</div>
							)}

							<div className="flex items-center justify-between gap-3 border-t pt-4">
								<div className="min-w-0">
									<p className="font-medium text-sm">Replace previous import</p>
									<p className="text-muted-foreground text-xs">
										Deletes rows from an earlier {selectedProvider.label} import
										first. Your tracked data is never touched.
									</p>
								</div>
								<Switch
									aria-label="Replace previous import"
									checked={replaceExisting}
									onCheckedChange={setReplaceExisting}
								/>
							</div>
						</Card.Content>
						<Card.Footer>
							<div className="flex w-full items-center justify-between">
								<p className="text-muted-foreground text-xs">
									Imported data is excluded from your billable event count.
								</p>
								<Button
									aria-label="Start import"
									disabled={!file || isStarting || isRunning}
									loading={isStarting}
									onClick={handleImport}
								>
									<DatabaseIcon className="size-4" />
									Start import
								</Button>
							</div>
						</Card.Footer>
					</Card>
				)}

				{run && (
					<Card>
						<Card.Header>
							<Card.Title>Progress</Card.Title>
							<Card.Description>
								{isRunning
									? `Importing. ${run.rows.toLocaleString()} rows written so far.`
									: `Import ${run.state}. ${run.rows.toLocaleString()} rows written.`}
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<div className="flex items-center gap-2">
								<Badge variant={run.failedReason ? "destructive" : "muted"}>
									{run.state}
								</Badge>
								{run.failedReason && (
									<span className="flex items-center gap-1 text-destructive text-xs">
										<WarningIcon className="size-4" />
										{run.failedReason}
									</span>
								)}
							</div>
						</Card.Content>
					</Card>
				)}
			</div>
		</div>
	);
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	ArrowsClockwiseIcon,
	CheckCircleIcon,
	CheckIcon,
	CopyIcon,
	KeyIcon,
	ProhibitIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { orpc } from "@/lib/orpc";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import type { ApiKeyDetail, ApiScope } from "./api-key-types";

type ApiKeyDetailDialogProps = {
	keyId: string | null;
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
};

const SCOPES: { value: ApiScope; label: string }[] = [
	{ value: "read:data", label: "Read Data" },
	{ value: "write:data", label: "Write Data" },
	{ value: "read:analytics", label: "Analytics" },
	{ value: "track:events", label: "Track Events" },
	{ value: "read:export", label: "Export" },
	{ value: "write:custom-sql", label: "Custom SQL" },
	{ value: "read:experiments", label: "Experiments" },
	{ value: "write:otel", label: "OpenTelemetry" },
	{ value: "admin:apikeys", label: "Manage Keys" },
];

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	enabled: z.boolean(),
	expiresAt: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

function DetailSkeleton() {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-muted/30 px-6 py-5">
				<div className="flex items-start gap-4">
					<Skeleton className="h-12 w-12 rounded" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-4 w-28" />
					</div>
					<Skeleton className="h-6 w-16 rounded-full" />
				</div>
			</div>
			<div className="flex-1 space-y-6 p-6">
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-11 w-full" />
					<Skeleton className="h-11 w-full" />
				</div>
				<Skeleton className="h-16 w-full rounded" />
				<div className="grid grid-cols-2 gap-1 rounded border bg-muted/20 p-1">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton className="h-10 w-full rounded" key={i.toString()} />
					))}
				</div>
			</div>
		</div>
	);
}

export function ApiKeyDetailDialog({
	keyId,
	open,
	onOpenChangeAction,
}: ApiKeyDetailDialogProps) {
	const queryClient = useQueryClient();
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	const { data, isLoading } = useQuery({
		...orpc.apikeys.getById.queryOptions({ input: { id: keyId ?? "" } }),
		enabled: !!keyId && open,
	});

	const detail = data as ApiKeyDetail | undefined;

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: { name: "", enabled: true, expiresAt: "" },
	});

	useEffect(() => {
		if (detail) {
			form.reset({
				name: detail.name,
				enabled: detail.enabled && !detail.revokedAt,
				expiresAt: detail.expiresAt?.slice(0, 10) ?? "",
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detail]);

	const handleClose = () => {
		onOpenChangeAction(false);
		setTimeout(() => {
			setNewSecret(null);
			setCopied(false);
			form.reset();
		}, 200);
	};

	const invalidateQueries = () => {
		queryClient.invalidateQueries({ queryKey: orpc.apikeys.list.key() });
		if (keyId) {
			queryClient.invalidateQueries({
				queryKey: orpc.apikeys.getById.key({ input: { id: keyId } }),
			});
		}
	};

	const updateMutation = useMutation({
		...orpc.apikeys.update.mutationOptions(),
		onSuccess: invalidateQueries,
	});

	const rotateMutation = useMutation({
		...orpc.apikeys.rotate.mutationOptions(),
		onSuccess: (res) => {
			setNewSecret(res.secret);
			invalidateQueries();
		},
	});

	const revokeMutation = useMutation({
		...orpc.apikeys.revoke.mutationOptions(),
		onSuccess: invalidateQueries,
	});

	const deleteMutation = useMutation({
		...orpc.apikeys.delete.mutationOptions(),
		onSuccess: () => {
			invalidateQueries();
			handleClose();
		},
	});

	const handleCopy = async () => {
		if (newSecret) {
			await navigator.clipboard.writeText(newSecret);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const onSubmit = form.handleSubmit((values) => {
		if (!keyId) return;
		updateMutation.mutate({
			id: keyId,
			name: values.name,
			enabled: values.enabled,
			expiresAt: values.expiresAt || null,
		});
	});

	const isActive = detail?.enabled && !detail?.revokedAt;

	return (
		<>
			<Sheet onOpenChange={handleClose} open={open}>
				<SheetContent
					className="m-3 h-[calc(100%-1.5rem)] rounded border bg-background p-0 sm:max-w-md"
					side="right"
				>
					{isLoading || !detail ? (
						<DetailSkeleton />
					) : (
						<div className="flex h-full flex-col">
							{/* Header */}
							<SheetHeader className="shrink-0 border-b bg-muted/30 px-6 py-5">
								<div className="flex items-start gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded border bg-background">
										<KeyIcon
											className="text-muted-foreground"
											size={24}
											weight="duotone"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<SheetTitle className="truncate text-lg">{detail.name}</SheetTitle>
										<SheetDescription className="font-mono text-xs">
											{detail.prefix}_{detail.start}…
										</SheetDescription>
									</div>
									<Badge
										className={
											isActive
												? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
												: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
										}
										variant="secondary"
									>
										{isActive ? "Active" : "Inactive"}
									</Badge>
								</div>
							</SheetHeader>

							<form className="flex flex-1 flex-col overflow-hidden" onSubmit={onSubmit}>
								{/* Content */}
								<div className="flex-1 space-y-6 overflow-y-auto p-6">
									{/* New Secret Alert */}
									{newSecret && (
										<div className="rounded border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
											<p className="mb-2 font-medium text-green-800 text-sm dark:text-green-300">
												New secret generated — copy it now
											</p>
											<div className="relative rounded border border-green-200 bg-white dark:border-green-700 dark:bg-green-950">
												<code className="block p-3 pr-12 font-mono text-xs break-all">
													{newSecret}
												</code>
												<Button
													className="absolute top-1.5 right-1.5"
													onClick={handleCopy}
													size="icon"
													variant="ghost"
												>
													{copied ? (
														<CheckCircleIcon className="text-green-600" size={16} />
													) : (
														<CopyIcon size={16} />
													)}
												</Button>
											</div>
										</div>
									)}

									{/* Settings Section */}
									<section className="space-y-4">
										<Label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Settings
										</Label>
										<div className="grid gap-4 sm:grid-cols-2">
											<div className="space-y-2">
												<Label htmlFor="name">Name</Label>
												<Input className="h-11" id="name" {...form.register("name")} />
											</div>
											<div className="space-y-2">
												<Label htmlFor="expiresAt">Expires</Label>
												<Input
													className="h-11"
													id="expiresAt"
													type="date"
													{...form.register("expiresAt")}
												/>
											</div>
										</div>

										{/* Enabled Toggle */}
										<div className="flex items-center justify-between rounded border bg-muted/20 p-4">
											<div>
												<p className="font-medium text-sm">Enabled</p>
												<p className="text-muted-foreground text-xs">
													Disable to block all requests
												</p>
											</div>
											<Switch
												checked={form.watch("enabled")}
												onCheckedChange={(v) => form.setValue("enabled", v)}
											/>
										</div>
									</section>

									{/* Permissions Section */}
									<section className="space-y-3">
										<Label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Permissions
										</Label>
										<div className="rounded border bg-muted/20 p-1">
											<div className="grid grid-cols-2 gap-1">
												{SCOPES.map((scope) => {
													const hasScope = detail.scopes.includes(scope.value);
													return (
														<div
															className={`flex items-center gap-2 rounded px-3 py-2.5 text-sm ${
																hasScope
																	? "bg-primary/10 text-foreground"
																	: "text-muted-foreground/50"
															}`}
															key={scope.value}
														>
															<div
																className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
																	hasScope
																		? "border-primary bg-primary text-primary-foreground"
																		: "border-muted-foreground/30"
																}`}
															>
																{hasScope && <CheckIcon size={10} weight="bold" />}
															</div>
															<span className="truncate">{scope.label}</span>
														</div>
													);
												})}
											</div>
										</div>
									</section>

									{/* Meta Section */}
									<section className="space-y-2 rounded border bg-muted/20 p-4">
										<div className="flex items-center justify-between text-sm">
											<span className="text-muted-foreground">Created</span>
											<span>{dayjs(detail.createdAt).format("MMM D, YYYY")}</span>
										</div>
										{detail.expiresAt && (
											<div className="flex items-center justify-between text-sm">
												<span className="text-muted-foreground">Expires</span>
												<span>{dayjs(detail.expiresAt).format("MMM D, YYYY")}</span>
											</div>
										)}
										{detail.revokedAt && (
											<div className="flex items-center justify-between text-sm">
												<span className="text-muted-foreground">Revoked</span>
												<span className="text-destructive">
													{dayjs(detail.revokedAt).format("MMM D, YYYY")}
												</span>
											</div>
										)}
									</section>

									{/* Danger Zone */}
									<section className="space-y-3">
										<Label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Actions
										</Label>
										<div className="flex flex-wrap gap-2">
											<Button
												className="flex-1"
												disabled={rotateMutation.isPending}
												onClick={() => rotateMutation.mutate({ id: keyId as string })}
												size="sm"
												type="button"
												variant="outline"
											>
												<ArrowsClockwiseIcon className="mr-1.5" size={14} />
												{rotateMutation.isPending ? "Rotating…" : "Rotate Secret"}
											</Button>
											<Button
												className="flex-1"
												disabled={revokeMutation.isPending || !isActive}
												onClick={() => revokeMutation.mutate({ id: keyId as string })}
												size="sm"
												type="button"
												variant="outline"
											>
												<ProhibitIcon className="mr-1.5" size={14} />
												{revokeMutation.isPending ? "Revoking…" : "Revoke Key"}
											</Button>
										</div>
										<Button
											className="w-full border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
											onClick={() => setShowDeleteConfirm(true)}
											size="sm"
											type="button"
											variant="outline"
										>
											<TrashIcon className="mr-1.5" size={14} />
											Delete Key Permanently
										</Button>
									</section>
								</div>

								{/* Footer */}
								<div className="shrink-0 flex items-center justify-end gap-3 border-t bg-muted/30 px-6 py-4">
									<Button onClick={handleClose} type="button" variant="ghost">
										Cancel
									</Button>
									<Button disabled={updateMutation.isPending} type="submit">
										{updateMutation.isPending ? "Saving…" : "Save Changes"}
									</Button>
								</div>
							</form>
						</div>
					)}
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation */}
			<AlertDialog onOpenChange={setShowDeleteConfirm} open={showDeleteConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete API Key?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. Any applications using this key will
							immediately lose access.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => deleteMutation.mutate({ id: keyId as string })}
						>
							{deleteMutation.isPending ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

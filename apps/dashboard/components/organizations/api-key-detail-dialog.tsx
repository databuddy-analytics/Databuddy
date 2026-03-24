"use client";

import { API_SCOPES, type ApiScope } from "@databuddy/api-keys/scopes";
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
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DeleteDialog } from "../ui/delete-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "../ui/sheet";
import { Switch } from "../ui/switch";
import { type ApiKeyListItem, SCOPE_OPTIONS } from "./api-key-types";

interface ApiKeyDetailDialogProps {
	apiKey: ApiKeyListItem | null;
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
}

const scopeSchema = z.enum(API_SCOPES);
const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	enabled: z.boolean(),
	expiresAt: z.string().optional(),
	scopes: z.array(scopeSchema),
});

type FormData = z.infer<typeof formSchema>;

function getEffectiveScopes(
	key: ApiKeyListItem | { scopes: string[] }
): ApiScope[] {
	const scopes = key.scopes ?? [];
	return scopes.filter((s) => API_SCOPES.includes(s as ApiScope)) as ApiScope[];
}

export function ApiKeyDetailDialog({
	apiKey,
	open,
	onOpenChangeAction,
}: ApiKeyDetailDialogProps) {
	const queryClient = useQueryClient();
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	const { data: fullKey } = useQuery({
		...orpc.apikeys.getById.queryOptions({ input: { id: apiKey?.id ?? "" } }),
		enabled: !!apiKey?.id && open,
	});

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			enabled: true,
			expiresAt: "",
			scopes: [] as ApiScope[],
		},
	});

	const lastResetKeyId = useRef<string | null>(null);

	useEffect(() => {
		if (!apiKey?.id) {
			return;
		}
		if (lastResetKeyId.current === apiKey.id) {
			return;
		}
		lastResetKeyId.current = apiKey.id;
		const keyToUse = fullKey?.id === apiKey.id ? fullKey : apiKey;
		form.reset({
			name: keyToUse.name,
			enabled: keyToUse.enabled && !keyToUse.revokedAt,
			expiresAt: keyToUse.expiresAt?.slice(0, 10) ?? "",
			scopes: getEffectiveScopes(keyToUse),
		});
	}, [apiKey?.id, apiKey, fullKey, form]);

	const handleClose = () => {
		onOpenChangeAction(false);
		setTimeout(() => {
			lastResetKeyId.current = null;
			setNewSecret(null);
			setCopied(false);
			form.reset();
		}, 200);
	};

	const invalidateQueries = () => {
		queryClient.invalidateQueries({ queryKey: orpc.apikeys.list.key() });
		if (apiKey?.id) {
			queryClient.invalidateQueries({
				queryKey: orpc.apikeys.getById.key({ input: { id: apiKey.id } }),
			});
		}
	};

	const toggleScope = (scope: ApiScope) => {
		const current = form.getValues("scopes") as ApiScope[];
		const next = current.includes(scope)
			? current.filter((s) => s !== scope)
			: [...current, scope];
		form.setValue("scopes", next);
	};

	const updateMutation = useMutation({
		...orpc.apikeys.update.mutationOptions(),
		onSuccess: () => {
			invalidateQueries();
			toast.success("API key updated");
		},
		onError: () => {
			toast.error("Failed to update API key");
		},
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
		if (!apiKey) {
			return;
		}
		const payload: Parameters<typeof updateMutation.mutate>[0] = {
			id: apiKey.id,
			name: values.name,
			enabled: values.enabled,
			expiresAt: values.expiresAt || null,
		};
		const scopes = values.scopes ?? [];
		if (fullKey?.resources === undefined) {
			payload.scopes = scopes;
		} else {
			const existing = fullKey.resources as Record<string, ApiScope[]>;
			const websiteResources = Object.fromEntries(
				Object.entries(existing).filter(([k]) => k !== "global")
			) as Record<string, ApiScope[]>;
			payload.scopes = [];
			payload.resources = {
				...websiteResources,
				...(scopes.length > 0 && { global: scopes }),
			};
		}
		updateMutation.mutate(payload);
	});

	const isActive = apiKey?.enabled && !apiKey?.revokedAt;

	if (!apiKey) {
		return null;
	}

	return (
		<>
			<Sheet onOpenChange={handleClose} open={open}>
				<SheetContent className="rounded sm:max-w-md" side="right">
					<SheetHeader className="shrink-0 pr-5">
						<div className="flex items-start gap-4">
							<div className="flex size-11 items-center justify-center rounded border bg-secondary-brighter">
								<KeyIcon className="text-foreground" size={22} weight="fill" />
							</div>
							<div className="min-w-0 flex-1">
								<SheetTitle className="truncate text-lg">
									{apiKey.name}
								</SheetTitle>
								<SheetDescription className="font-mono text-xs">
									{apiKey.prefix}_{apiKey.start}…
								</SheetDescription>
							</div>
							<Badge variant={isActive ? "green" : "secondary"}>
								{isActive ? "Active" : "Inactive"}
							</Badge>
						</div>
					</SheetHeader>

					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={onSubmit}
					>
						<SheetBody className="space-y-5">
							{newSecret && (
								<div className="rounded border border-green-200 bg-green-50 p-3 dark:border-green-900/50 dark:bg-green-900/20">
									<p className="mb-2 font-medium text-green-800 text-sm dark:text-green-300">
										New secret generated
									</p>
									<div className="relative rounded border border-green-200 bg-background dark:border-green-900/50">
										<code className="block break-all p-3 pr-12 font-mono text-xs">
											{newSecret}
										</code>
										<Button
											className="absolute top-1.5 right-1.5 size-7 text-muted-foreground hover:text-foreground"
											onClick={handleCopy}
											size="icon"
											type="button"
											variant="ghost"
										>
											{copied ? (
												<CheckCircleIcon
													className="text-green-600"
													size={14}
													weight="fill"
												/>
											) : (
												<CopyIcon size={14} />
											)}
										</Button>
									</div>
								</div>
							)}

							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="name">Name</Label>
									<Input id="name" {...form.register("name")} />
								</div>
								<div className="space-y-2">
									<Label htmlFor="expiresAt">Expires</Label>
									<Input
										id="expiresAt"
										type="date"
										{...form.register("expiresAt")}
									/>
								</div>
							</div>

							<div className="flex items-center justify-between">
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

							<section className="space-y-2">
								<Label className="font-medium text-muted-foreground text-xs uppercase">
									Permissions
								</Label>
								<div className="rounded border bg-card p-1">
									<div className="grid grid-cols-2 gap-1">
										{SCOPE_OPTIONS.map((scope) => {
											const selectedScopes = form.watch("scopes") as ApiScope[];
											const hasScope = selectedScopes.includes(scope.value);
											const isDefault = scope.value === "read:data";
											return (
												<button
													className="flex items-center gap-2 rounded px-3 py-2.5 text-left text-sm hover:bg-muted/50"
													key={scope.value}
													onClick={() => toggleScope(scope.value)}
													type="button"
												>
													<div
														className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
															hasScope
																? "border-primary bg-primary text-primary-foreground"
																: "border-muted-foreground/30"
														}`}
													>
														{hasScope && <CheckIcon size={12} weight="bold" />}
													</div>
													<span className="truncate">{scope.label}</span>
													{isDefault && (
														<span className="text-[10px] text-muted-foreground">
															default
														</span>
													)}
												</button>
											);
										})}
									</div>
								</div>
							</section>

							<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
								<span>
									Created {dayjs(apiKey.createdAt).format("MMM D, YYYY")}
								</span>
								{apiKey.expiresAt && (
									<span>
										Expires {dayjs(apiKey.expiresAt).format("MMM D, YYYY")}
									</span>
								)}
								{apiKey.revokedAt && (
									<span className="text-destructive">
										Revoked {dayjs(apiKey.revokedAt).format("MMM D, YYYY")}
									</span>
								)}
							</div>

							<div className="flex items-center gap-2 border-t pt-4">
								<Button
									disabled={rotateMutation.isPending}
									onClick={() => rotateMutation.mutate({ id: apiKey.id })}
									size="sm"
									type="button"
									variant="outline"
								>
									<ArrowsClockwiseIcon size={14} />
									{rotateMutation.isPending ? "Rotating…" : "Rotate"}
								</Button>
								<Button
									disabled={revokeMutation.isPending || !isActive}
									onClick={() => revokeMutation.mutate({ id: apiKey.id })}
									size="sm"
									type="button"
									variant="outline"
								>
									<ProhibitIcon size={14} />
									{revokeMutation.isPending ? "Revoking…" : "Revoke"}
								</Button>
								<Button
									className="ml-auto text-destructive hover:text-destructive"
									onClick={() => setShowDeleteConfirm(true)}
									size="sm"
									type="button"
									variant="ghost"
								>
									<TrashIcon size={14} />
									Delete
								</Button>
							</div>
						</SheetBody>

						<SheetFooter>
							<Button onClick={handleClose} type="button" variant="outline">
								Cancel
							</Button>
							<Button disabled={updateMutation.isPending} type="submit">
								{updateMutation.isPending ? "Saving…" : "Save Changes"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

			<DeleteDialog
				confirmLabel="Delete"
				description="This action cannot be undone. Any applications using this key will immediately lose access."
				isDeleting={deleteMutation.isPending}
				isOpen={showDeleteConfirm}
				onClose={() => setShowDeleteConfirm(false)}
				onConfirm={() => deleteMutation.mutate({ id: apiKey.id })}
				title="Delete API Key?"
			/>
		</>
	);
}

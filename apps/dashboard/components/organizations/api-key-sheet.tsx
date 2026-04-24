"use client";

import { API_SCOPES, type ApiScope } from "@databuddy/api-keys/scopes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	ArrowsClockwiseIcon,
	CheckCircleIcon,
	ClockIcon,
	CopyIcon,
	GaugeIcon,
	GlobeIcon,
	KeyIcon,
	LockKeyIcon,
	ProhibitIcon,
	ShieldCheckIcon,
	TrashIcon,
	WarningDiamondIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ExpirationPicker } from "@/app/(main)/links/_components/expiration-picker";
import { Accordion } from "@/components/ds/accordion";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Checkbox } from "@/components/ds/checkbox";
import { Dialog } from "@/components/ds/dialog";
import { Divider } from "@/components/ds/divider";
import { Field } from "@/components/ds/field";
import { Input } from "@/components/ds/input";
import { Sheet } from "@/components/ds/sheet";
import { Switch } from "@/components/ds/switch";
import { TagsInput } from "@/components/ds/tags-input";
import { Text } from "@/components/ds/text";
import { Textarea } from "@/components/ds/textarea";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { type ApiKeyListItem, SCOPE_OPTIONS } from "./api-key-types";

interface ApiKeySheetProps {
	apiKey: ApiKeyListItem | null;
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	organizationId: string;
}

const formSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(500),
	enabled: z.boolean(),
	expiresAt: z.string(),
	scopes: z.array(z.string()),
	rateLimitEnabled: z.boolean(),
	rateLimitMax: z.string(),
	rateLimitWindow: z.string(),
});

type FormData = z.infer<typeof formSchema>;

interface WebsiteAccess {
	resourceId: string;
	scopes: ApiScope[];
}

function splitResources(resources: Record<string, string[]> | undefined) {
	if (!resources) {
		return { global: [] as ApiScope[], websites: [] as WebsiteAccess[] };
	}
	const allowed = new Set<string>(API_SCOPES);
	const filter = (arr: string[]) =>
		arr.filter((s) => allowed.has(s)) as ApiScope[];
	const websites: WebsiteAccess[] = [];
	let global: ApiScope[] = [];
	for (const [key, scopes] of Object.entries(resources)) {
		if (key === "global") {
			global = filter(scopes);
			continue;
		}
		if (key.startsWith("website:")) {
			websites.push({
				resourceId: key.slice("website:".length),
				scopes: filter(scopes),
			});
		}
	}
	return { global, websites };
}

function SettingRow({
	label,
	description,
	control,
	tone,
}: {
	label: React.ReactNode;
	description?: React.ReactNode;
	control: React.ReactNode;
	tone?: "destructive";
}) {
	return (
		<div className="flex items-center justify-between gap-4 py-2.5">
			<div className="min-w-0 flex-1">
				<Text
					className={cn(tone === "destructive" && "text-destructive")}
					variant="label"
				>
					{label}
				</Text>
				{description ? (
					<Text className="mt-0.5" tone="muted" variant="caption">
						{description}
					</Text>
				) : null}
			</div>
			<div className="shrink-0">{control}</div>
		</div>
	);
}

function SectionCard({
	children,
	tone,
}: {
	children: React.ReactNode;
	tone?: "destructive";
}) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-md border",
				tone === "destructive" ? "border-destructive/30" : "border-border/60"
			)}
		>
			{children}
		</div>
	);
}

export function ApiKeySheet({
	apiKey,
	open,
	onOpenChangeAction,
	organizationId,
}: ApiKeySheetProps) {
	const isCreate = !apiKey;
	const queryClient = useQueryClient();
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const { isCopied, copyToClipboard } = useCopyToClipboard();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [showRotateConfirm, setShowRotateConfirm] = useState(false);
	const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
	const [tags, setTags] = useState<string[]>([]);
	const [websiteAccess, setWebsiteAccess] = useState<WebsiteAccess[]>([]);

	const { data: roleInfo } = useQuery({
		...orpc.apikeys.getMyRole.queryOptions({ input: { organizationId } }),
		enabled: open && !!organizationId,
	});
	const canEditScopes = roleInfo?.canEditScopes ?? false;

	const { data: websites } = useQuery({
		...orpc.websites.list.queryOptions({ input: { organizationId } }),
		enabled: open && !!organizationId,
	});

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			description: "",
			enabled: true,
			expiresAt: "",
			scopes: [] as string[],
			rateLimitEnabled: true,
			rateLimitMax: "",
			rateLimitWindow: "",
		},
	});

	const lastResetKeyId = useRef<string | null>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		const resetKey = apiKey?.id ?? "__create__";
		if (lastResetKeyId.current === resetKey) {
			return;
		}
		lastResetKeyId.current = resetKey;

		if (!apiKey) {
			form.reset({
				name: "",
				description: "",
				enabled: true,
				expiresAt: "",
				scopes: ["read:data"],
				rateLimitEnabled: true,
				rateLimitMax: "",
				rateLimitWindow: "",
			});
			setTags([]);
			setWebsiteAccess([]);
			return;
		}

		const { global, websites: wsAccess } = splitResources(apiKey.resources);
		const scopeSet = new Set<ApiScope>([
			...(apiKey.scopes as ApiScope[]).filter((s) =>
				(API_SCOPES as readonly string[]).includes(s)
			),
			...global,
		]);

		form.reset({
			name: apiKey.name,
			description: apiKey.description ?? "",
			enabled: apiKey.enabled && !apiKey.revokedAt,
			expiresAt: apiKey.expiresAt
				? dayjs(apiKey.expiresAt).format("YYYY-MM-DDTHH:mm")
				: "",
			scopes: [...scopeSet],
			rateLimitEnabled: apiKey.ratelimit?.enabled ?? true,
			rateLimitMax:
				apiKey.ratelimit?.max == null ? "" : String(apiKey.ratelimit.max),
			rateLimitWindow:
				apiKey.ratelimit?.window == null ? "" : String(apiKey.ratelimit.window),
		});
		setTags(apiKey.tags ?? []);
		setWebsiteAccess(wsAccess);
	}, [apiKey, open, form]);

	const handleClose = () => {
		onOpenChangeAction(false);
		setTimeout(() => {
			lastResetKeyId.current = null;
			setNewSecret(null);
			setTags([]);
			setWebsiteAccess([]);
			form.reset();
		}, 200);
	};

	const invalidateQueries = () => {
		queryClient.invalidateQueries({ queryKey: orpc.apikeys.list.key() });
	};

	const toggleScope = (scope: string) => {
		if (!canEditScopes) {
			return;
		}
		const current = form.getValues("scopes");
		const next = current.includes(scope)
			? current.filter((s) => s !== scope)
			: [...current, scope];
		form.setValue("scopes", next, { shouldDirty: true });
	};

	const toggleWebsiteScope = (resourceId: string, scope: ApiScope) => {
		if (!canEditScopes) {
			return;
		}
		setWebsiteAccess((prev) =>
			prev.map((entry) => {
				if (entry.resourceId !== resourceId) {
					return entry;
				}
				const scopes = entry.scopes.includes(scope)
					? entry.scopes.filter((s) => s !== scope)
					: [...entry.scopes, scope];
				return { ...entry, scopes };
			})
		);
	};

	const toggleWebsite = (resourceId: string) => {
		setWebsiteAccess((prev) => {
			if (prev.some((e) => e.resourceId === resourceId)) {
				return prev.filter((e) => e.resourceId !== resourceId);
			}
			return [...prev, { resourceId, scopes: [] }];
		});
	};

	const createMutation = useMutation({
		...orpc.apikeys.create.mutationOptions(),
		onSuccess: (res) => {
			invalidateQueries();
			setNewSecret(res.secret);
			toast.success("API key created");
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to create API key");
		},
	});

	const updateMutation = useMutation({
		...orpc.apikeys.update.mutationOptions(),
		onSuccess: () => {
			invalidateQueries();
			toast.success("API key updated");
			handleClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to update API key");
		},
	});

	const rotateMutation = useMutation({
		...orpc.apikeys.rotate.mutationOptions(),
		onSuccess: (res) => {
			setNewSecret(res.secret);
			invalidateQueries();
			toast.success("API key rotated");
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to rotate API key");
		},
	});

	const revokeMutation = useMutation({
		...orpc.apikeys.revoke.mutationOptions(),
		onSuccess: () => {
			invalidateQueries();
			toast.success("API key revoked");
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to revoke API key");
		},
	});

	const deleteMutation = useMutation({
		...orpc.apikeys.delete.mutationOptions(),
		onSuccess: () => {
			invalidateQueries();
			toast.success("API key deleted");
			handleClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to delete API key");
		},
	});

	const buildResources = (scopes: ApiScope[]) => {
		const nextResources: Record<string, ApiScope[]> = {};
		if (scopes.length > 0) {
			nextResources.global = scopes;
		}
		for (const entry of websiteAccess) {
			if (entry.scopes.length > 0) {
				nextResources[`website:${entry.resourceId}`] = entry.scopes;
			}
		}
		return nextResources;
	};

	const onSubmit = form.handleSubmit((values) => {
		if (isCreate) {
			if (newSecret) {
				handleClose();
				return;
			}
			type CreateInput = Parameters<typeof createMutation.mutate>[0];
			const globalScopes = (values.scopes ?? []) as ApiScope[];
			const nextResources = buildResources(globalScopes);
			const payload: CreateInput = {
				name: values.name,
				organizationId,
				description: values.description || undefined,
				expiresAt: values.expiresAt
					? dayjs(values.expiresAt).toISOString()
					: undefined,
				tags: tags.length > 0 ? tags : undefined,
				ratelimit: {
					enabled: values.rateLimitEnabled,
					max: values.rateLimitMax ? Number(values.rateLimitMax) : null,
					window: values.rateLimitWindow
						? Number(values.rateLimitWindow)
						: null,
				},
				scopes: [],
				resources:
					Object.keys(nextResources).length > 0
						? (nextResources as CreateInput["resources"])
						: undefined,
			};
			createMutation.mutate(payload);
			return;
		}

		if (!apiKey) {
			return;
		}
		type MutationInput = Parameters<typeof updateMutation.mutate>[0];
		const payload: MutationInput = {
			id: apiKey.id,
			name: values.name,
			description: values.description || null,
			enabled: values.enabled,
			expiresAt: values.expiresAt
				? dayjs(values.expiresAt).toISOString()
				: null,
			tags,
			ratelimit: {
				enabled: values.rateLimitEnabled,
				max: values.rateLimitMax ? Number(values.rateLimitMax) : null,
				window: values.rateLimitWindow ? Number(values.rateLimitWindow) : null,
			},
		};

		if (canEditScopes) {
			const globalScopes = (values.scopes ?? []) as ApiScope[];
			payload.scopes = [];
			payload.resources = buildResources(
				globalScopes
			) as MutationInput["resources"];
		}

		updateMutation.mutate(payload);
	});

	const status = apiKey
		? apiKey.revokedAt
			? { label: "Revoked", variant: "destructive" as const }
			: apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()
				? { label: "Expired", variant: "warning" as const }
				: apiKey.enabled
					? { label: "Active", variant: "success" as const }
					: { label: "Disabled", variant: "muted" as const }
		: null;
	const isActive = !!apiKey && apiKey.enabled && !apiKey.revokedAt;

	const scopeCount = form.watch("scopes").length;
	const rateLimitEnabled = form.watch("rateLimitEnabled");
	const submitPending = isCreate
		? createMutation.isPending
		: updateMutation.isPending;
	const submitLabel = isCreate
		? newSecret
			? "Done"
			: "Create Key"
		: "Save Changes";

	return (
		<>
			<Sheet onOpenChange={handleClose} open={open}>
				<Sheet.Content className="sm:max-w-lg" side="right">
					<Sheet.Header>
						<div className="flex items-start gap-3">
							<div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
								<KeyIcon className="text-primary" size={14} weight="fill" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<Sheet.Title className="truncate">
										{apiKey ? apiKey.name : "Create API Key"}
									</Sheet.Title>
									{status && (
										<Badge size="sm" variant={status.variant}>
											{status.label}
										</Badge>
									)}
								</div>
								{apiKey ? (
									<Sheet.Description className="font-mono">
										{apiKey.prefix}_{apiKey.start}••••
									</Sheet.Description>
								) : (
									<Sheet.Description>
										Generate a key for programmatic access.
									</Sheet.Description>
								)}
							</div>
						</div>
					</Sheet.Header>

					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={onSubmit}
					>
						<Sheet.Body className="space-y-6">
							{newSecret && (
								<div className="rounded-md border border-success/30 bg-success/5 p-3">
									<div className="mb-2 flex items-center gap-1.5">
										<CheckCircleIcon
											className="text-success"
											size={13}
											weight="fill"
										/>
										<Text className="text-success" variant="label">
											{isCreate ? "Secret key" : "New secret generated"}
										</Text>
									</div>
									<div className="group relative overflow-hidden rounded-md border border-success/20 bg-background">
										<div className="relative px-3 py-2.5">
											<code className="block break-all pr-8 font-mono text-[11px] text-foreground leading-relaxed">
												{newSecret}
											</code>
											<button
												className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground"
												onClick={() => copyToClipboard(newSecret)}
												type="button"
											>
												{isCopied ? (
													<CheckCircleIcon
														className="text-success"
														size={13}
														weight="fill"
													/>
												) : (
													<CopyIcon size={13} />
												)}
											</button>
										</div>
									</div>
									<Text className="mt-2" tone="muted" variant="caption">
										Copy this now — it won't be shown again.
									</Text>
								</div>
							)}

							{apiKey && (
								<dl className="grid grid-cols-3 gap-x-4 gap-y-1">
									<div>
										<Text as="dt" tone="muted" variant="caption">
											Created
										</Text>
										<Text as="dd" variant="label">
											{dayjs(apiKey.createdAt).format("MMM D, YYYY")}
										</Text>
									</div>
									<div>
										<Text as="dt" tone="muted" variant="caption">
											Last used
										</Text>
										<Text
											as="dd"
											className={cn(
												!apiKey.lastUsedAt && "text-muted-foreground"
											)}
											variant="label"
										>
											{apiKey.lastUsedAt
												? dayjs(apiKey.lastUsedAt).fromNow()
												: "Never"}
										</Text>
									</div>
									<div>
										<Text as="dt" tone="muted" variant="caption">
											{apiKey.revokedAt ? "Revoked" : "Expires"}
										</Text>
										<Text
											as="dd"
											className={cn(
												!(apiKey.revokedAt || apiKey.expiresAt) &&
													"text-muted-foreground"
											)}
											variant="label"
										>
											{apiKey.revokedAt
												? dayjs(apiKey.revokedAt).format("MMM D, YYYY")
												: apiKey.expiresAt
													? dayjs(apiKey.expiresAt).format("MMM D, YYYY")
													: "Never"}
										</Text>
									</div>
								</dl>
							)}

							<div className="space-y-4">
								<Field>
									<Field.Label>Name</Field.Label>
									<Input {...form.register("name")} />
								</Field>
								<Field>
									<Field.Label>Description</Field.Label>
									<Textarea
										maxRows={5}
										minRows={2}
										placeholder="What is this key used for?"
										{...form.register("description")}
									/>
								</Field>
								<Field>
									<Field.Label>Tags</Field.Label>
									<TagsInput
										onChange={setTags}
										placeholder="Add a tag and press enter"
										values={tags}
									/>
									<Field.Description>
										Up to 10 tags, 50 characters each.
									</Field.Description>
								</Field>
							</div>

							<div className="space-y-2">
								<SectionCard>
									<Accordion defaultOpen={isCreate}>
										<Accordion.Trigger>
											<ClockIcon
												className="size-4 shrink-0 text-muted-foreground"
												weight="duotone"
											/>
											<Text variant="label">
												{isCreate ? "Expiry" : "Status & expiry"}
											</Text>
											{status && (
												<Badge
													className="ml-auto"
													size="sm"
													variant={status.variant}
												>
													{status.label}
												</Badge>
											)}
										</Accordion.Trigger>
										<Accordion.Content>
											<div className="space-y-3">
												{apiKey && (
													<>
														<SettingRow
															control={
																<Switch
																	aria-label="Enabled"
																	checked={form.watch("enabled")}
																	onCheckedChange={(v) =>
																		form.setValue("enabled", v as boolean, {
																			shouldDirty: true,
																		})
																	}
																/>
															}
															description="Disable to temporarily block all requests using this key."
															label="Enabled"
														/>
														<Divider />
													</>
												)}
												<Field>
													<Field.Label>Expires</Field.Label>
													<ExpirationPicker
														onChange={(v) =>
															form.setValue("expiresAt", v, {
																shouldDirty: true,
															})
														}
														value={form.watch("expiresAt")}
													/>
												</Field>
											</div>
										</Accordion.Content>
									</Accordion>
								</SectionCard>

								<SectionCard>
									<Accordion>
										<Accordion.Trigger>
											<ShieldCheckIcon
												className="size-4 shrink-0 text-muted-foreground"
												weight="duotone"
											/>
											<Text variant="label">Permissions</Text>
											<Badge className="ml-auto" size="sm" variant="muted">
												{scopeCount} selected
											</Badge>
										</Accordion.Trigger>
										<Accordion.Content>
											{canEditScopes ? null : (
												<Text className="mb-2" tone="muted" variant="caption">
													Only organization owners or admins can change scopes.
												</Text>
											)}
											<div className="divide-y divide-border/60">
												{SCOPE_OPTIONS.map((scope) => {
													const hasScope = form
														.watch("scopes")
														.includes(scope.value);
													return (
														<div className="py-2" key={scope.value}>
															<Checkbox
																checked={hasScope}
																disabled={!canEditScopes}
																label={
																	<span className="flex items-center gap-2">
																		{scope.label}
																		{scope.value === "read:data" && (
																			<Badge size="sm" variant="muted">
																				default
																			</Badge>
																		)}
																	</span>
																}
																onCheckedChange={() => toggleScope(scope.value)}
															/>
														</div>
													);
												})}
											</div>
										</Accordion.Content>
									</Accordion>
								</SectionCard>

								<SectionCard>
									<Accordion>
										<Accordion.Trigger>
											<GlobeIcon
												className="size-4 shrink-0 text-muted-foreground"
												weight="duotone"
											/>
											<Text variant="label">Website access</Text>
											{websiteAccess.length > 0 && (
												<Badge className="ml-auto" size="sm" variant="muted">
													{websiteAccess.length} website
													{websiteAccess.length === 1 ? "" : "s"}
												</Badge>
											)}
										</Accordion.Trigger>
										<Accordion.Content>
											<div className="space-y-3">
												<Text tone="muted" variant="caption">
													Select websites to scope this key. Leaving all
													unselected grants workspace-wide access using the
													permissions above.
												</Text>

												{websites && websites.length > 0 ? (
													<div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
														{websites.map((w) => {
															const entry = websiteAccess.find(
																(e) => e.resourceId === w.id
															);
															const isSelected = !!entry;
															return (
																<div key={w.id}>
																	<div className="flex items-center gap-2 px-3 py-2">
																		<Checkbox
																			checked={isSelected}
																			disabled={!canEditScopes}
																			label={
																				<span className="flex min-w-0 flex-col">
																					<span className="truncate font-medium text-foreground text-xs">
																						{w.name || w.domain}
																					</span>
																					{w.domain && w.name && (
																						<span className="truncate text-[11px] text-muted-foreground">
																							{w.domain}
																						</span>
																					)}
																				</span>
																			}
																			onCheckedChange={() =>
																				toggleWebsite(w.id)
																			}
																		/>
																		{isSelected && entry.scopes.length > 0 && (
																			<Badge
																				className="ml-auto"
																				size="sm"
																				variant="muted"
																			>
																				{entry.scopes.length}{" "}
																				{entry.scopes.length === 1
																					? "scope"
																					: "scopes"}
																			</Badge>
																		)}
																	</div>
																	{isSelected && (
																		<div className="grid grid-cols-2 gap-x-3 border-border/60 border-t bg-secondary/40 px-3 py-2 pl-8">
																			{SCOPE_OPTIONS.map((scope) => (
																				<div className="py-1" key={scope.value}>
																					<Checkbox
																						checked={entry.scopes.includes(
																							scope.value
																						)}
																						disabled={!canEditScopes}
																						label={scope.label}
																						onCheckedChange={() =>
																							toggleWebsiteScope(
																								w.id,
																								scope.value
																							)
																						}
																					/>
																				</div>
																			))}
																		</div>
																	)}
																</div>
															);
														})}
													</div>
												) : (
													<div className="flex items-center gap-2 rounded-md border border-border/60 border-dashed px-3 py-3">
														<LockKeyIcon
															className="size-4 shrink-0 text-muted-foreground"
															weight="duotone"
														/>
														<Text tone="muted" variant="caption">
															No websites in this workspace yet.
														</Text>
													</div>
												)}
											</div>
										</Accordion.Content>
									</Accordion>
								</SectionCard>

								<SectionCard>
									<Accordion>
										<Accordion.Trigger>
											<GaugeIcon
												className="size-4 shrink-0 text-muted-foreground"
												weight="duotone"
											/>
											<Text variant="label">Rate limit</Text>
											<Badge
												className="ml-auto"
												size="sm"
												variant={rateLimitEnabled ? "success" : "muted"}
											>
												{rateLimitEnabled ? "On" : "Off"}
											</Badge>
										</Accordion.Trigger>
										<Accordion.Content>
											<div className="space-y-3">
												<SettingRow
													control={
														<Switch
															aria-label="Rate limiting"
															checked={rateLimitEnabled}
															onCheckedChange={(v) =>
																form.setValue(
																	"rateLimitEnabled",
																	v as boolean,
																	{ shouldDirty: true }
																)
															}
														/>
													}
													description="Apply your workspace plan limits to this key."
													label="Rate limiting"
												/>
												<Divider />
												<div className="space-y-2">
													<Text tone="muted" variant="caption">
														Override your plan defaults for this key. Leave
														blank to use your plan limits (e.g. 300 req/min on
														Free, 1,200 req/min on Pro).
													</Text>
													<div className="grid gap-4 sm:grid-cols-2">
														<Field>
															<Field.Label>Max requests</Field.Label>
															<Input
																disabled={!rateLimitEnabled}
																inputMode="numeric"
																placeholder="Plan default"
																{...form.register("rateLimitMax")}
															/>
														</Field>
														<Field>
															<Field.Label>Window (seconds)</Field.Label>
															<Input
																disabled={!rateLimitEnabled}
																inputMode="numeric"
																placeholder="Plan default"
																{...form.register("rateLimitWindow")}
															/>
														</Field>
													</div>
												</div>
											</div>
										</Accordion.Content>
									</Accordion>
								</SectionCard>

								{apiKey && (
									<SectionCard tone="destructive">
										<Accordion>
											<Accordion.Trigger className="bg-destructive/5 hover:bg-destructive/10">
												<WarningDiamondIcon
													className="size-4 shrink-0 text-destructive"
													weight="duotone"
												/>
												<Text className="text-destructive" variant="label">
													Danger zone
												</Text>
											</Accordion.Trigger>
											<Accordion.Content className="bg-destructive/5">
												<div className="divide-y divide-destructive/20">
													<SettingRow
														control={
															<Button
																loading={rotateMutation.isPending}
																onClick={() => setShowRotateConfirm(true)}
																size="sm"
																type="button"
																variant="secondary"
															>
																<ArrowsClockwiseIcon size={13} />
																Rotate
															</Button>
														}
														description="Generate a new secret and invalidate the current one."
														label="Rotate secret"
													/>
													<SettingRow
														control={
															<Button
																disabled={!isActive}
																loading={revokeMutation.isPending}
																onClick={() => setShowRevokeConfirm(true)}
																size="sm"
																tone="danger"
																type="button"
																variant="secondary"
															>
																<ProhibitIcon size={13} />
																Revoke
															</Button>
														}
														description="Disable this key immediately. Revocation is permanent."
														label="Revoke key"
														tone="destructive"
													/>
													<SettingRow
														control={
															<Button
																onClick={() => setShowDeleteConfirm(true)}
																size="sm"
																tone="danger"
																type="button"
																variant="secondary"
															>
																<TrashIcon size={13} />
																Delete
															</Button>
														}
														description="Remove the key and all associated metadata. Cannot be undone."
														label="Delete key"
														tone="destructive"
													/>
												</div>
											</Accordion.Content>
										</Accordion>
									</SectionCard>
								)}
							</div>
						</Sheet.Body>

						<Sheet.Footer>
							{!(isCreate && newSecret) && (
								<Button onClick={handleClose} type="button" variant="secondary">
									Cancel
								</Button>
							)}
							<Button loading={submitPending} type="submit">
								{submitLabel}
							</Button>
						</Sheet.Footer>
					</form>
					<Sheet.Close />
				</Sheet.Content>
			</Sheet>

			{apiKey && (
				<>
					<Dialog onOpenChange={setShowDeleteConfirm} open={showDeleteConfirm}>
						<Dialog.Content>
							<Dialog.Header>
								<Dialog.Title>Delete API Key?</Dialog.Title>
								<Dialog.Description>
									This action cannot be undone. Any applications using this key
									will immediately lose access.
								</Dialog.Description>
							</Dialog.Header>
							<Dialog.Footer>
								<Button
									onClick={() => setShowDeleteConfirm(false)}
									variant="secondary"
								>
									Cancel
								</Button>
								<Button
									loading={deleteMutation.isPending}
									onClick={() => deleteMutation.mutate({ id: apiKey.id })}
									tone="danger"
								>
									Delete
								</Button>
							</Dialog.Footer>
							<Dialog.Close />
						</Dialog.Content>
					</Dialog>

					<Dialog onOpenChange={setShowRotateConfirm} open={showRotateConfirm}>
						<Dialog.Content>
							<Dialog.Header>
								<Dialog.Title>Rotate API Key?</Dialog.Title>
								<Dialog.Description>
									A new secret will be generated and the current one will stop
									working immediately. Anything using the old secret will break
									until updated.
								</Dialog.Description>
							</Dialog.Header>
							<Dialog.Footer>
								<Button
									onClick={() => setShowRotateConfirm(false)}
									variant="secondary"
								>
									Cancel
								</Button>
								<Button
									loading={rotateMutation.isPending}
									onClick={() => {
										rotateMutation.mutate(
											{ id: apiKey.id },
											{ onSettled: () => setShowRotateConfirm(false) }
										);
									}}
								>
									Rotate
								</Button>
							</Dialog.Footer>
							<Dialog.Close />
						</Dialog.Content>
					</Dialog>

					<Dialog onOpenChange={setShowRevokeConfirm} open={showRevokeConfirm}>
						<Dialog.Content>
							<Dialog.Header>
								<Dialog.Title>Revoke API Key?</Dialog.Title>
								<Dialog.Description>
									This key will stop working immediately. Revocation is
									permanent — the key cannot be re-enabled. Create a new key if
									you need one.
								</Dialog.Description>
							</Dialog.Header>
							<Dialog.Footer>
								<Button
									onClick={() => setShowRevokeConfirm(false)}
									variant="secondary"
								>
									Cancel
								</Button>
								<Button
									loading={revokeMutation.isPending}
									onClick={() => {
										revokeMutation.mutate(
											{ id: apiKey.id },
											{ onSettled: () => setShowRevokeConfirm(false) }
										);
									}}
									tone="danger"
								>
									Revoke
								</Button>
							</Dialog.Footer>
							<Dialog.Close />
						</Dialog.Content>
					</Dialog>
				</>
			)}
		</>
	);
}

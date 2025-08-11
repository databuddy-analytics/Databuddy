import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '../ui/form';
import { Input } from '../ui/input';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '../ui/sheet';
import { Skeleton } from '../ui/skeleton';
import { Switch } from '../ui/switch';
import type { ApiKeyDetail, ApiScope } from './api-key-types';

// Loading component
function ApiKeyDetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<Skeleton className="h-6 w-48 rounded" />
				<div className="rounded border p-4">
					<div className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-5 w-32 rounded" />
							<Skeleton className="h-4 w-20 rounded" />
						</div>
					</div>
				</div>
			</div>

			<div className="space-y-4">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Skeleton className="h-4 w-16 rounded" />
						<Skeleton className="h-10 w-full rounded" />
					</div>
					<div className="space-y-2">
						<Skeleton className="h-4 w-20 rounded" />
						<Skeleton className="h-10 w-full rounded" />
					</div>
				</div>
				<div className="rounded border p-4">
					<div className="flex items-center justify-between">
						<div className="space-y-1">
							<Skeleton className="h-4 w-16 rounded" />
							<Skeleton className="h-3 w-32 rounded" />
						</div>
						<Skeleton className="h-6 w-12 rounded" />
					</div>
				</div>
			</div>

			<div className="space-y-3">
				<Skeleton className="h-5 w-24 rounded" />
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
					{['s1', 's2', 's3', 's4'].map((key) => (
						<Skeleton className="h-10 w-full rounded" key={key} />
					))}
				</div>
			</div>
		</div>
	);
}

// Global scopes display component
function GlobalScopesDisplay({ scopes }: { scopes: string[] }) {
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<h3 className="font-medium text-foreground">Global Permissions</h3>
			</div>
			{scopes.length > 0 ? (
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
					{scopes.map((s) => (
						<div className="flex items-center gap-3 rounded border p-3" key={s}>
							<Checkbox checked disabled />
							<div className="font-medium text-sm">{s}</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded border border-dashed p-4 text-center">
					<div className="text-muted-foreground text-sm">
						No global permissions assigned to this key.
					</div>
				</div>
			)}
		</div>
	);
}

// Resource access display component
function ResourceAccessDisplay({ access }: { access: ApiKeyDetail['access'] }) {
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<h3 className="font-medium text-foreground">Resource Access</h3>
			</div>
			<div className="space-y-3">
				{access.length > 0 ? (
					access.map((a) => (
						<div className="rounded border p-4" key={a.id}>
							<div className="mb-3">
								<div className="font-medium text-sm capitalize">
									{a.resourceType}
								</div>
								{a.resourceId && (
									<code className="font-mono text-muted-foreground text-xs">
										{a.resourceId}
									</code>
								)}
							</div>
							<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
								{(
									[
										'read:data',
										'write:data',
										'read:experiments',
										'track:events',
										'admin:apikeys',
									] as ApiScope[]
								).map((s) => (
									<div
										className="flex items-center gap-3 rounded border p-2"
										key={`${a.id}-${s}`}
									>
										<Checkbox checked={a.scopes.includes(s)} disabled />
										<div className="font-medium text-sm">{s}</div>
									</div>
								))}
							</div>
						</div>
					))
				) : (
					<div className="rounded border border-dashed p-6 text-center">
						<div className="text-muted-foreground text-sm">
							No resource-specific access configured for this key.
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// Action buttons component
function ApiKeyActions({
	keyId,
	rotateMutation,
	revokeMutation,
	deleteMutation,
	updateMutation,
	onShowSecret,
}: {
	keyId: string | null;
	rotateMutation: ReturnType<typeof trpc.apikeys.rotate.useMutation>;
	revokeMutation: ReturnType<typeof trpc.apikeys.revoke.useMutation>;
	deleteMutation: ReturnType<typeof trpc.apikeys.delete.useMutation>;
	updateMutation: ReturnType<typeof trpc.apikeys.update.useMutation>;
	onShowSecret: (secret: string) => void;
}) {
	return (
		<div className="flex justify-end gap-3 border-border/50 border-t pt-6">
			<div className="flex gap-2">
				<Button
					disabled={!keyId || rotateMutation.isPending}
					onClick={async () => {
						const res = await rotateMutation.mutateAsync({
							id: keyId as string,
						});
						onShowSecret(res.secret);
					}}
					type="button"
					variant="outline"
				>
					{rotateMutation.isPending ? 'Rotating…' : 'Rotate Key'}
				</Button>
				<Button
					disabled={!keyId || revokeMutation.isPending}
					onClick={() => revokeMutation.mutate({ id: keyId as string })}
					type="button"
					variant="outline"
				>
					{revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
				</Button>
			</div>
			<div className="flex gap-2">
				<Button disabled={updateMutation.isPending} type="submit">
					{updateMutation.isPending ? 'Saving…' : 'Save Changes'}
				</Button>
				<Button
					disabled={!keyId || deleteMutation.isPending}
					onClick={() => deleteMutation.mutate({ id: keyId as string })}
					type="button"
					variant="destructive"
				>
					{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
				</Button>
			</div>
		</div>
	);
}

interface ApiKeyDetailDialogProps {
	keyId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ApiKeyDetailDialog({
	keyId,
	open,
	onOpenChange,
}: ApiKeyDetailDialogProps) {
	const utils = trpc.useUtils();
	const { data, isLoading } = trpc.apikeys.getById.useQuery(
		{ id: keyId ?? '' },
		{ enabled: !!keyId }
	);
	const rotateMutation = trpc.apikeys.rotate.useMutation({
		onSuccess: async () => {
			if (keyId) {
				await utils.apikeys.getById.invalidate({ id: keyId });
			}
			await utils.apikeys.list.invalidate();
		},
	});
	const revokeMutation = trpc.apikeys.revoke.useMutation({
		onSuccess: async () => {
			await utils.apikeys.getById.invalidate({ id: keyId as string });
			await utils.apikeys.list.invalidate();
		},
	});
	const deleteMutation = trpc.apikeys.delete.useMutation({
		onSuccess: async () => {
			await utils.apikeys.list.invalidate();
			onOpenChange(false);
		},
	});

	const detail = data as ApiKeyDetail | undefined;
	const [showSecret, setShowSecret] = useState<string | null>(null);

	const effectiveStatus = useMemo(
		() => (detail?.enabled && !detail?.revokedAt ? 'Enabled' : 'Disabled'),
		[detail]
	);

	// form schema for inline updates
	const formSchema = z.object({
		name: z.string().min(1, 'Name is required'),
		enabled: z.boolean().optional(),
		expiresAt: z.string().optional(),
	});

	type FormData = z.infer<typeof formSchema>;

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: { name: '', enabled: true, expiresAt: undefined },
	});

	useEffect(() => {
		if (!detail) {
			return;
		}
		form.reset({
			name: detail.name,
			enabled: detail.enabled && !detail.revokedAt,
			expiresAt: detail.expiresAt ? detail.expiresAt.slice(0, 10) : undefined,
		});
	}, [detail, form]);

	const updateMutation = trpc.apikeys.update.useMutation({
		onSuccess: async () => {
			await utils.apikeys.getById.invalidate({ id: keyId as string });
			await utils.apikeys.list.invalidate();
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		if (!keyId) {
			return;
		}
		await updateMutation.mutateAsync({
			id: keyId,
			name: values.name,
			enabled: values.enabled,
			expiresAt: values.expiresAt || null,
		});
	});

	// Reset transient state when dialog closes or when a different key is opened
	useEffect(() => {
		if (!open) {
			setShowSecret(null);
			form.reset({ name: '', enabled: true, expiresAt: undefined });
		}
	}, [open, form]);

	// Removed unnecessary dependency-based reset to satisfy linter

	return (
		<Sheet
			onOpenChange={(o) => {
				if (!o) {
					setShowSecret(null);
					form.reset({ name: '', enabled: true, expiresAt: undefined });
				}
				onOpenChange(o);
			}}
			open={open}
		>
			<SheetContent
				className="w-full overflow-y-auto p-4 sm:w-[480px] sm:max-w-[480px]"
				side="right"
			>
				<SheetHeader className="space-y-1 pb-3">
					<SheetTitle className="text-foreground text-lg">
						Manage API Key
					</SheetTitle>
					<SheetDescription className="text-muted-foreground text-xs">
						View details, update, rotate or revoke
					</SheetDescription>
				</SheetHeader>
				<div className="space-y-5 pt-2">
					{isLoading || !detail ? (
						<ApiKeyDetailSkeleton />
					) : (
						<>
							{/* Key Overview */}
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<div className="font-semibold text-base text-foreground">
										{detail.name}
									</div>
									<Badge
										variant={
											detail.enabled && !detail.revokedAt
												? 'default'
												: 'secondary'
										}
									>
										{effectiveStatus}
									</Badge>
								</div>
								<code className="block rounded bg-muted px-2 py-1 font-mono text-xs">
									{detail.prefix}_{detail.start}
								</code>
							</div>
							{/* Configuration Form */}
							<div className="space-y-3">
								<div className="font-semibold text-foreground text-sm">
									Configuration
								</div>

								<Form {...form}>
									<form className="space-y-6" onSubmit={onSubmit}>
										<div className="grid grid-cols-1 gap-3">
											<FormField
												control={form.control}
												name="name"
												render={({ field }) => (
													<FormItem>
														<FormLabel className="font-medium text-foreground text-sm">
															Name
														</FormLabel>
														<FormControl>
															<Input placeholder="Key name" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="expiresAt"
												render={({ field }) => (
													<FormItem>
														<FormLabel className="font-medium text-foreground text-sm">
															Expires on
														</FormLabel>
														<FormControl>
															<Input
																onChange={field.onChange}
																type="date"
																value={field.value ?? ''}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>

										<FormField
											control={form.control}
											name="enabled"
											render={({ field }) => (
												<FormItem className="flex items-center justify-between rounded border p-3">
													<FormLabel className="font-medium text-foreground text-sm">
														Enabled
													</FormLabel>
													<FormControl>
														<Switch
															checked={!!field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>
												</FormItem>
											)}
										/>

										<ApiKeyActions
											deleteMutation={deleteMutation}
											keyId={keyId}
											onShowSecret={setShowSecret}
											revokeMutation={revokeMutation}
											rotateMutation={rotateMutation}
											updateMutation={updateMutation}
										/>
									</form>
								</Form>
							</div>
							<GlobalScopesDisplay scopes={detail.scopes} />
							<ResourceAccessDisplay access={detail.access} />
						</>
					)}
					{showSecret && (
						<div className="rounded border bg-accent/10 p-4">
							<div className="mb-2 font-semibold text-foreground text-sm">
								🔑 Copy your new secret now
							</div>
							<p className="mb-3 text-muted-foreground text-xs">
								This secret will only be shown once. Store it securely.
							</p>
							<code className="block break-all rounded bg-muted p-3 font-mono text-sm">
								{showSecret}
							</code>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

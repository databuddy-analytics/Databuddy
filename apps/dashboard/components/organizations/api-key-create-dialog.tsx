"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	CheckCircleIcon,
	CheckIcon,
	CopyIcon,
	GlobeIcon,
	KeyIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { orpc } from "@/lib/orpc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "../ui/sheet";
import type { ApiKeyAccessEntry, ApiScope } from "./api-key-types";

type ApiKeyCreateDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId?: string;
	onSuccess: Dispatch<
		SetStateAction<{
			id: string;
			secret: string;
			prefix: string;
			start: string;
		} | null>
	>;
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
	name: z.string().min(1, "Name is required").max(100),
});

type FormData = z.infer<typeof formSchema>;

export function ApiKeyCreateDialog({
	open,
	onOpenChange,
	organizationId,
	onSuccess,
}: ApiKeyCreateDialogProps) {
	const queryClient = useQueryClient();
	const [globalScopes, setGlobalScopes] = useState<ApiScope[]>([]);
	const [websiteAccess, setWebsiteAccess] = useState<ApiKeyAccessEntry[]>([]);
	const [websiteToAdd, setWebsiteToAdd] = useState<string | undefined>();
	const [created, setCreated] = useState<{ secret: string } | null>(null);
	const [copied, setCopied] = useState(false);

	const { data: websites } = useQuery({
		...orpc.websites.list.queryOptions({ input: { organizationId } }),
	});

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: { name: "" },
	});

	const mutation = useMutation({
		...orpc.apikeys.create.mutationOptions(),
		onSuccess: (res) => {
			queryClient.invalidateQueries({ queryKey: orpc.apikeys.list.key() });
			setCreated(res);
			onSuccess(res);
		},
	});

	const handleClose = () => {
		onOpenChange(false);
		setTimeout(() => {
			form.reset();
			setGlobalScopes([]);
			setWebsiteAccess([]);
			setWebsiteToAdd(undefined);
			setCreated(null);
			setCopied(false);
		}, 200);
	};

	const handleCopy = async () => {
		if (created?.secret) {
			await navigator.clipboard.writeText(created.secret);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const toggleGlobalScope = (scope: ApiScope) => {
		setGlobalScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
		);
	};

	const addWebsite = () => {
		if (!websiteToAdd) return;
		if (websiteAccess.some((e) => e.resourceId === websiteToAdd)) return;
		setWebsiteAccess((prev) => [
			...prev,
			{ resourceType: "website", resourceId: websiteToAdd, scopes: [] },
		]);
		setWebsiteToAdd(undefined);
	};

	const removeWebsite = (resourceId: string) => {
		setWebsiteAccess((prev) => prev.filter((e) => e.resourceId !== resourceId));
	};

	const toggleWebsiteScope = (resourceId: string, scope: ApiScope) => {
		setWebsiteAccess((prev) =>
			prev.map((entry) => {
				if (entry.resourceId !== resourceId) return entry;
				const scopes = entry.scopes.includes(scope)
					? entry.scopes.filter((s) => s !== scope)
					: [...entry.scopes, scope];
				return { ...entry, scopes };
			})
		);
	};

	const onSubmit = form.handleSubmit((values) => {
		const resources: Record<string, ApiScope[]> = {};
		for (const entry of websiteAccess) {
			if (entry.resourceId) {
				resources[entry.resourceId] = entry.scopes;
			}
		}

		mutation.mutate({
			name: values.name,
			organizationId,
			scopes: globalScopes,
			resources: Object.keys(resources).length > 0 ? resources : undefined,
		});
	});

	// Success view
	if (created) {
		return (
			<Sheet onOpenChange={handleClose} open={open}>
				<SheetContent className="sm:max-w-md" side="right">
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
							<CheckCircleIcon
								className="text-green-600 dark:text-green-400"
								size={32}
								weight="duotone"
							/>
						</div>
						<SheetHeader className="mb-6 border-0 bg-transparent p-0 text-center">
							<SheetTitle className="text-xl">API Key Created</SheetTitle>
							<SheetDescription className="text-sm">
								Copy this secret now — you won't see it again.
							</SheetDescription>
						</SheetHeader>

						<div className="w-full max-w-sm space-y-4">
							<div className="relative rounded border bg-muted/50">
								<code className="block break-all p-4 pr-12 font-mono text-sm">
									{created.secret}
								</code>
								<Button
									className="absolute top-2.5 right-2.5"
									onClick={handleCopy}
									size="icon"
									variant="ghost"
								>
									{copied ? (
										<CheckCircleIcon className="text-green-500" size={18} />
									) : (
										<CopyIcon size={18} />
									)}
								</Button>
							</div>
							<Button className="w-full" onClick={handleClose} size="lg">
								Done
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>
		);
	}

	// Create form
	return (
		<Sheet onOpenChange={handleClose} open={open}>
			<SheetContent className="sm:max-w-md" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex h-11 w-11 items-center justify-center rounded border bg-secondary-brighter">
							<KeyIcon
								className="text-accent-foreground"
								size={22}
								weight="fill"
							/>
						</div>
						<div>
							<SheetTitle className="text-lg">Create API Key</SheetTitle>
							<SheetDescription>
								Generate a new key with permissions
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<form
					className="flex flex-1 flex-col overflow-y-auto"
					onSubmit={onSubmit}
				>
					<SheetBody className="space-y-6">
						{/* Name Section */}
						<section className="space-y-3">
							<Label className="font-medium" htmlFor="name">
								Key Name
							</Label>
							<Input
								id="name"
								placeholder="e.g., Production API Key"
								{...form.register("name")}
							/>
							{form.formState.errors.name && (
								<p className="text-destructive text-sm">
									{form.formState.errors.name.message}
								</p>
							)}
						</section>

						{/* Global Permissions */}
						<section className="space-y-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<GlobeIcon className="text-muted-foreground" size={16} />
									<Label className="font-medium">Global Permissions</Label>
								</div>
								<Badge className="font-normal" variant="secondary">
									{globalScopes.length} selected
								</Badge>
							</div>
							<p className="text-muted-foreground text-xs">
								These permissions apply to all websites
							</p>
							<div className="rounded border bg-card p-1">
								<div className="grid grid-cols-2 gap-1">
									{SCOPES.map((scope) => {
										const isSelected = globalScopes.includes(scope.value);
										return (
											<button
												className="flex items-center gap-2 rounded px-3 py-2.5 text-left text-sm"
												key={scope.value}
												onClick={() => toggleGlobalScope(scope.value)}
												type="button"
											>
												<div
													className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
														isSelected
															? "border-primary bg-primary text-primary"
															: "border-muted-foreground/30"
													}`}
												>
													{isSelected && (
														<CheckIcon
															className="text-white"
															size={12}
															weight="bold"
														/>
													)}
												</div>
												<span className="truncate">{scope.label}</span>
											</button>
										);
									})}
								</div>
							</div>
						</section>

						{/* Website-Specific Permissions */}
						{websites && websites.length > 0 && (
							<section className="space-y-3">
								<div className="flex items-center gap-2">
									<Label className="font-medium">Website Restrictions</Label>
									<span className="text-muted-foreground text-xs">
										optional
									</span>
								</div>
								<p className="text-muted-foreground text-xs">
									Limit this key to specific websites with custom permissions
								</p>

								{/* Add Website */}
								<div className="flex gap-2">
									<Select onValueChange={setWebsiteToAdd} value={websiteToAdd}>
										<SelectTrigger className="h-10 flex-1">
											<SelectValue placeholder="Select a website..." />
										</SelectTrigger>
										<SelectContent>
											{websites
												.filter(
													(w) =>
														!websiteAccess.some((e) => e.resourceId === w.id)
												)
												.map((w) => (
													<SelectItem key={w.id} value={w.id}>
														{w.name || w.domain}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
									<Button
										disabled={!websiteToAdd}
										onClick={addWebsite}
										size="icon"
										type="button"
										variant="outline"
									>
										<PlusIcon size={16} />
									</Button>
								</div>

								{/* Website Access List */}
								{websiteAccess.length > 0 && (
									<div className="space-y-3">
										{websiteAccess.map((entry) => {
											const website = websites.find(
												(w) => w.id === entry.resourceId
											);
											return (
												<div
													className="rounded border bg-muted/20 p-3"
													key={entry.resourceId}
												>
													<div className="mb-3 flex items-center justify-between">
														<span className="font-medium text-sm">
															{website?.name ||
																website?.domain ||
																entry.resourceId}
														</span>
														<Button
															className="size-7"
															onClick={() =>
																removeWebsite(entry.resourceId ?? "")
															}
															size="icon"
															type="button"
															variant="ghost"
														>
															<TrashIcon size={14} />
														</Button>
													</div>
													<div className="grid grid-cols-2 gap-1">
														{SCOPES.slice(0, 6).map((scope) => {
															const isSelected = entry.scopes.includes(
																scope.value
															);
															return (
																<button
																	className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
																		isSelected
																			? "bg-primary/20 text-foreground"
																			: "hover:bg-muted"
																	}`}
																	key={scope.value}
																	onClick={() =>
																		toggleWebsiteScope(
																			entry.resourceId ?? "",
																			scope.value
																		)
																	}
																	type="button"
																>
																	<div
																		className={`flex size-3 shrink-0 items-center justify-center rounded-sm border ${
																			isSelected
																				? "border-primary bg-primary text-primary-foreground"
																				: "border-muted-foreground/30"
																		}`}
																	>
																		{isSelected && (
																			<CheckIcon size={8} weight="bold" />
																		)}
																	</div>
																	<span className="truncate">
																		{scope.label}
																	</span>
																</button>
															);
														})}
													</div>
												</div>
											);
										})}
									</div>
								)}
							</section>
						)}
					</SheetBody>

					<SheetFooter>
						<Button onClick={handleClose} type="button" variant="ghost">
							Cancel
						</Button>
						<Button disabled={mutation.isPending} type="submit">
							{mutation.isPending ? (
								"Creating..."
							) : (
								<>
									<PlusIcon size={16} />
									Create Key
								</>
							)}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

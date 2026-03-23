"use client";

import type { ApiScope } from "@databuddy/api-keys/scopes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	CaretUpDownIcon,
	CheckCircleIcon,
	CheckIcon,
	CopyIcon,
	KeyIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Website } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../ui/command";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "../ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { type ApiKeyAccessEntry, SCOPE_OPTIONS } from "./api-key-types";

interface ApiKeyCreateDialogProps {
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
	organizationId: string;
	onSuccessAction: (data: {
		id: string;
		secret: string;
		prefix: string;
		start: string;
	}) => void;
}

const formSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
});

type FormData = z.infer<typeof formSchema>;

const DEFAULT_SCOPES: ApiScope[] = ["read:data"];
const ALL_SCOPES: ApiScope[] = SCOPE_OPTIONS.map((opt) => opt.value);

export function ApiKeyCreateDialog({
	open,
	onOpenChangeAction,
	organizationId,
	onSuccessAction,
}: ApiKeyCreateDialogProps) {
	const queryClient = useQueryClient();
	// const [globalScopes, setGlobalScopes] = useState<ApiScope[]>(ALL_SCOPES);
	const [websiteAccess, setWebsiteAccess] = useState<ApiKeyAccessEntry[]>([]);

	const [scopeMode, setScopeMode] = useState("all");
	const [restrictedScopes, setRestrictedScopes] =
		useState<ApiScope[]>(DEFAULT_SCOPES);

	const [popoverOpen, setPopoverOpen] = useState(false);
	const [created, setCreated] = useState<{
		id: string;
		secret: string;
		prefix: string;
		start: string;
	} | null>(null);
	const [copied, setCopied] = useState(false);

	const { data: websites } = useQuery({
		...orpc.websites.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId && open,
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
		},
	});

	const globalScopes = useMemo(() => {
		switch (scopeMode) {
			case "all":
				return ALL_SCOPES;
			case "restricted":
				return restrictedScopes;
			case "read-data":
				return DEFAULT_SCOPES;
			default:
				return DEFAULT_SCOPES;
		}
	}, [scopeMode, restrictedScopes]);

	const handleClose = () => {
		if (created) {
			onSuccessAction(created);
		}
		onOpenChangeAction(false);
		setTimeout(() => {
			form.reset();
			setScopeMode("all");
			setRestrictedScopes(DEFAULT_SCOPES);
			setWebsiteAccess([]);
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

	const addWebsite = (resourceId: string) => {
		if (websiteAccess.some((e) => e.resourceId === resourceId)) {
			return;
		}
		setWebsiteAccess((prev) => [
			...prev,
			{ resourceType: "website", resourceId, scopes: [] },
			// don't snapshot globalScopes here, as they are computed on submit to ensure they reflect the latest selection
		]);
	};

	const removeWebsite = (resourceId: string) => {
		setWebsiteAccess((prev) => prev.filter((e) => e.resourceId !== resourceId));
	};

	const isWebsiteSelected = (resourceId: string) => {
		return websiteAccess.some((e) => e.resourceId === resourceId);
	};

	const onSubmit = form.handleSubmit((values) => {
		const resources: Record<string, ApiScope[]> = {};

		if (globalScopes.length > 0 && websiteAccess.length === 0) {
			resources.global = globalScopes;
		}

		// Add website-specific scopes with proper prefix
		for (const entry of websiteAccess) {
			if (entry.resourceId) {
				// snapshot globalScopes on submit to ensure it reflects latest selection
				resources[`website:${entry.resourceId}`] = globalScopes;
			}
		}

		mutation.mutate({
			name: values.name,
			organizationId,
			scopes: [],
			resources: Object.keys(resources).length > 0 ? resources : undefined,
		});
	});

	// Success view
	if (created) {
		return (
			<Sheet onOpenChange={handleClose} open={open}>
				<SheetContent className="sm:max-w-md" side="right">
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<div className="zoom-in-90 mb-5 flex h-16 w-16 animate-in items-center justify-center rounded-full bg-green-100 duration-200 ease-out dark:bg-green-900/30">
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
								<Label className="font-medium">Global Permissions</Label>
								<Badge className="font-normal" variant="outline">
									{globalScopes.length} selected
								</Badge>
							</div>
							<p className="text-muted-foreground text-xs">
								These permissions apply to all websites unless you restrict to
								specific ones below.
							</p>
							<Tabs
								defaultValue="all"
								onValueChange={setScopeMode}
								value={scopeMode}
								variant="default"
							>
								<TabsList className="w-full bg-background">
									<TabsTrigger value="all">All</TabsTrigger>
									<TabsTrigger value="restricted">Restricted</TabsTrigger>
									<TabsTrigger value="read-data">Read data only</TabsTrigger>
								</TabsList>
								<TabsContent
									className="rounded border bg-card"
									value="restricted"
								>
									<div className="grid grid-cols-2 gap-1">
										{SCOPE_OPTIONS.map((scope) => {
											const isSelected = restrictedScopes.includes(scope.value);
											const isDefault = DEFAULT_SCOPES.includes(scope.value);
											return (
												<button
													className="flex items-center gap-2 rounded px-3 py-2.5 text-left text-sm"
													key={scope.value}
													onClick={() =>
														setRestrictedScopes((prev) => {
															if (prev.includes(scope.value)) {
																return prev.filter((s) => s !== scope.value);
															}
															return [...prev, scope.value];
														})
													}
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
													{isDefault && (
														<span className="text-[10px] text-muted-foreground">
															default
														</span>
													)}
												</button>
											);
										})}
									</div>
								</TabsContent>
							</Tabs>
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
									Limit this key to specific websites
								</p>

								<Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
									<PopoverTrigger asChild>
										<Button
											aria-expanded={popoverOpen}
											className="w-full justify-between"
											role="combobox"
											variant="outline"
										>
											{websiteAccess.length > 0
												? `${websiteAccess.map((entry) => websites?.find((w) => w.id === entry.resourceId)?.name || entry.resourceId).join(", ")}`
												: "Select websites..."}
											<CaretUpDownIcon className="size-3.5 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent
										align="start"
										className="w-(--radix-popover-trigger-width) p-0"
									>
										<Command>
											<CommandInput placeholder="Search websites..." />
											<CommandList>
												<CommandEmpty>No websites found.</CommandEmpty>
												<CommandGroup>
													{(websites as Website[]).map((website) => (
														<CommandItem
															key={website.id}
															onSelect={(currentValue) => {
																isWebsiteSelected(currentValue)
																	? removeWebsite(currentValue)
																	: addWebsite(currentValue);
																setPopoverOpen(false);
															}}
															value={website.id}
														>
															{website.name || website.domain}
															<CheckIcon
																className={`ml-auto size-3.5 ${
																	isWebsiteSelected(website.id)
																		? "opacity-100"
																		: "opacity-0"
																}`}
															/>
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
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

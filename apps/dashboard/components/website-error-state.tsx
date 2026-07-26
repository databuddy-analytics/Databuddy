"use client";

import { Command as CommandPrimitive } from "cmdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { mainNavigation } from "@/components/layout/navigation/navigation-config";
import { ResourceUnavailableState } from "@/components/resource-unavailable-state";
import type {
	NavigationGroup,
	NavigationItem,
} from "@/components/layout/navigation/types";
import { cn } from "@/lib/utils";
import {
	ArrowLeftIcon,
	CommandIcon,
	HouseIcon,
	LockIcon,
	MagnifyingGlassIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";

interface SearchItem {
	icon: NavigationItem["icon"];
	name: string;
	path: string;
}

function toSearchItem(item: NavigationItem): SearchItem | null {
	if (item.disabled || item.hideFromDemo || !item.href) {
		return null;
	}
	return {
		name: item.name,
		path: item.href,
		icon: item.icon,
	};
}

function flattenNavigation(groups: NavigationGroup[]): SearchItem[] {
	const items: SearchItem[] = [];
	for (const group of groups) {
		for (const item of group.items) {
			const searchItem = toSearchItem(item);
			if (searchItem) {
				items.push(searchItem);
			}
		}
	}
	return items;
}

interface WebsiteErrorStateProps {
	error: unknown;
	isDemoRoute?: boolean;
	isPublicDashboard?: boolean;
	websiteId?: string;
}

function getErrorType(error: unknown): {
	type: "not_found" | "unauthorized" | "forbidden" | "unknown";
	message?: string;
	code?: string;
} {
	if (!error || typeof error !== "object") {
		return { type: "unknown" };
	}

	const rpcError = error as {
		data?: { code?: string; message?: string };
		code?: string;
		message?: string;
	};

	const errorCode = rpcError?.data?.code ?? rpcError?.code;
	const errorMessage = rpcError?.data?.message ?? rpcError?.message ?? "";

	if (errorCode) {
		switch (errorCode) {
			case "NOT_FOUND":
				return { type: "not_found", message: errorMessage, code: "NOT_FOUND" };
			case "UNAUTHORIZED":
				return {
					type: "unauthorized",
					message: errorMessage,
					code: "UNAUTHORIZED",
				};
			case "FORBIDDEN":
				return { type: "forbidden", message: errorMessage, code: "FORBIDDEN" };
			default:
				return { type: "unknown", message: errorMessage, code: errorCode };
		}
	}

	const messageLower = errorMessage.toLowerCase();
	if (
		messageLower.includes("authentication is required") ||
		messageLower.includes("unauthorized") ||
		messageLower.includes("sign in") ||
		messageLower.includes("login")
	) {
		return {
			type: "unauthorized",
			message: errorMessage,
			code: "UNAUTHORIZED",
		};
	}

	if (
		messageLower.includes("not found") ||
		messageLower.includes("doesn't exist")
	) {
		return { type: "not_found", message: errorMessage, code: "NOT_FOUND" };
	}

	if (
		messageLower.includes("permission") ||
		messageLower.includes("forbidden") ||
		messageLower.includes("access denied")
	) {
		return { type: "forbidden", message: errorMessage, code: "FORBIDDEN" };
	}

	return { type: "unknown", message: errorMessage };
}

export function WebsiteErrorState({
	error,
	websiteId: _websiteId,
	isDemoRoute = false,
	isPublicDashboard = false,
}: WebsiteErrorStateProps) {
	const router = useRouter();
	const { type } = getErrorType(error);
	const isPublicView = isDemoRoute || isPublicDashboard;

	const _getErrorCode = () => {
		switch (type) {
			case "not_found":
				return "ERR_WEBSITE_NOT_FOUND";
			case "unauthorized":
				return "ERR_UNAUTHORIZED";
			case "forbidden":
				return "ERR_FORBIDDEN";
			default:
				return "ERR_UNKNOWN";
		}
	};

	const _getErrorNumber = () => {
		switch (type) {
			case "not_found":
				return "404";
			case "unauthorized":
				return "401";
			case "forbidden":
				return "403";
			default:
				return "500";
		}
	};

	const getIcon = () => {
		switch (type) {
			case "not_found":
				return MagnifyingGlassIcon;
			case "unauthorized":
			case "forbidden":
				return LockIcon;
			default:
				return WarningCircleIcon;
		}
	};

	const getTitle = () => {
		switch (type) {
			case "not_found":
				return isPublicDashboard
					? "Dashboard not available"
					: "Website not found";
			case "unauthorized":
				if (isPublicDashboard) {
					return "Dashboard not available";
				}
				return isDemoRoute ? "Demo not available" : "Authentication required";
			case "forbidden":
				if (isPublicDashboard) {
					return "Dashboard not available";
				}
				return isDemoRoute ? "Demo not available" : "Access denied";
			default:
				return "Something went wrong";
		}
	};

	const getDescription = () => {
		switch (type) {
			case "not_found":
				if (isPublicDashboard) {
					return "This shared dashboard does not exist or sharing has been turned off.";
				}
				return isDemoRoute
					? "This demo page doesn't exist or is no longer available."
					: "The website you're looking for doesn't exist or has been removed.";
			case "unauthorized":
				if (isPublicDashboard) {
					return "This dashboard is private or sharing has been turned off.";
				}
				return isDemoRoute
					? "This demo page is private and requires authentication."
					: "You need to sign in to view this website's analytics.";
			case "forbidden":
				if (isPublicDashboard) {
					return "This dashboard is private or sharing has been turned off.";
				}
				return isDemoRoute
					? "This demo page is private and requires authentication."
					: "You don't have permission to view this website's analytics.";
			default:
				return "We couldn't load this website. Try again in a moment.";
		}
	};

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const searchItems = useMemo(() => {
		const items = flattenNavigation(mainNavigation);
		if (!search.trim()) {
			return items;
		}
		const query = search.toLowerCase();
		return items.filter(
			(item) =>
				item.name.toLowerCase().includes(query) ||
				item.path.toLowerCase().includes(query)
		);
	}, [search]);

	const handleSelect = (item: SearchItem) => {
		setOpen(false);
		setSearch("");
		router.push(item.path);
	};

	const canGoBack = typeof window !== "undefined" && window.history.length > 1;

	if (!isPublicView && (type === "not_found" || type === "forbidden")) {
		return (
			<ResourceUnavailableState
				backHref="/websites"
				backLabel="Back to Websites"
				className="min-h-full p-4 sm:p-6 lg:p-8"
			/>
		);
	}

	const renderActions = () => {
		if (type === "not_found") {
			return (
				<>
					{canGoBack && (
						<Button
							className="flex-1"
							onClick={() => router.back()}
							variant="secondary"
						>
							<ArrowLeftIcon className="mr-2 size-4" weight="duotone" />
							Go Back
						</Button>
					)}
					<Button asChild className={canGoBack ? "flex-1" : "w-full"}>
						<Link href={isPublicView ? "/" : "/websites"}>
							<HouseIcon className="mr-2 size-4" weight="duotone" />
							{isPublicView ? "Go to homepage" : "Back to websites"}
						</Link>
					</Button>
				</>
			);
		}

		if (type === "unauthorized" || type === "forbidden") {
			return (
				<div className="flex w-full max-w-xs flex-col gap-4 sm:flex-row">
					{isPublicView ? (
						<>
							<Button
								className="flex-1"
								onClick={() => router.push("/login")}
								size="lg"
							>
								Sign In
							</Button>
							<Button
								className="flex-1"
								onClick={() => router.push("/")}
								size="lg"
								variant="secondary"
							>
								Go to Homepage
							</Button>
						</>
					) : (
						<>
							<Button
								className="flex-1"
								onClick={() => router.push("/websites")}
								size="lg"
							>
								<ArrowLeftIcon className="mr-2 size-4" weight="duotone" />
								Back to Websites
							</Button>
							{type === "unauthorized" && (
								<Button
									className="flex-1"
									onClick={() => router.push("/login")}
									size="lg"
									variant="secondary"
								>
									Sign In
								</Button>
							)}
						</>
					)}
				</div>
			);
		}

		return (
			<div className="flex w-full max-w-xs flex-col gap-4 sm:flex-row">
				<Button className="flex-1" onClick={() => router.refresh()} size="lg">
					Try Again
				</Button>
				<Button
					className="flex-1"
					onClick={() => router.push(isPublicView ? "/" : "/websites")}
					size="lg"
					variant="secondary"
				>
					{isPublicView ? "Go to homepage" : "Back to websites"}
				</Button>
			</div>
		);
	};

	const IconComponent = getIcon();
	const actions = renderActions();

	return (
		<div className="flex min-h-full flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
			<Card className="flex w-full max-w-md flex-1 flex-col items-center justify-center rounded border-none bg-transparent shadow-none">
				<Card.Content className="flex flex-col items-center justify-center px-6 py-12 text-center sm:px-8 sm:py-14 lg:px-12">
					<div
						aria-hidden="true"
						className={cn(
							"flex size-12 items-center justify-center rounded-2xl",
							type === "not_found" && "bg-accent",
							(type === "unauthorized" || type === "forbidden") &&
								"bg-orange-500/10",
							type === "unknown" && "bg-destructive/10"
						)}
						role="img"
					>
						<IconComponent
							aria-hidden="true"
							className={cn(
								"size-6",
								type === "not_found" && "text-muted-foreground",
								(type === "unauthorized" || type === "forbidden") &&
									"text-orange-500 dark:text-orange-400",
								type === "unknown" && "text-destructive"
							)}
							weight="fill"
						/>
					</div>

					<div className="mt-6 w-full max-w-sm space-y-4">
						<h1 className="font-semibold text-foreground text-lg">
							{getTitle()}
						</h1>
						<p className="text-balance text-muted-foreground text-sm leading-relaxed">
							{getDescription()}
						</p>
					</div>

					{type === "not_found" && !isPublicView && (
						<Button
							className="mt-6 w-full max-w-xs"
							onClick={() => setOpen(true)}
							variant="secondary"
						>
							<MagnifyingGlassIcon className="mr-2 size-4" weight="duotone" />
							Search pages, settings...
							<kbd className="ml-auto hidden items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-muted-foreground text-xs sm:flex">
								<CommandIcon className="size-3" weight="bold" />
								<span>K</span>
							</kbd>
						</Button>
					)}

					{type === "not_found" && !isPublicView && (
						<Dialog onOpenChange={setOpen} open={open}>
							<Dialog.Content className="gap-0 overflow-hidden p-0 sm:max-w-xl">
								<Dialog.Header className="sr-only">
									<Dialog.Title>Search</Dialog.Title>
									<Dialog.Description>
										Search for pages and settings
									</Dialog.Description>
								</Dialog.Header>
								<Dialog.Body className="p-0">
									<CommandPrimitive
										className="flex h-full w-full flex-col"
										loop
										onKeyDown={(e) => {
											if (e.key === "Escape") {
												setOpen(false);
											}
										}}
									>
										<div className="dotted-bg flex items-center gap-3 border-b bg-accent px-4 py-3">
											<div className="flex size-8 shrink-0 items-center justify-center rounded bg-background">
												<MagnifyingGlassIcon
													className="size-4 text-muted-foreground"
													weight="duotone"
												/>
											</div>
											<CommandPrimitive.Input
												className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
												onValueChange={setSearch}
												placeholder="Search pages, settings..."
												value={search}
											/>
											<kbd className="hidden items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-muted-foreground text-xs sm:flex">
												<CommandIcon className="size-3" weight="bold" />
												<span>K</span>
											</kbd>
										</div>

										<CommandPrimitive.List className="max-h-80 scroll-py-2 overflow-y-auto p-2">
											<CommandPrimitive.Empty className="flex flex-col items-center justify-center gap-2 py-12 text-center">
												<MagnifyingGlassIcon
													className="size-8 text-muted-foreground/50"
													weight="duotone"
												/>
												<div>
													<p className="font-medium text-muted-foreground text-sm">
														No results found
													</p>
													<p className="text-muted-foreground/70 text-xs">
														Try searching for something else
													</p>
												</div>
											</CommandPrimitive.Empty>
											{searchItems.map((item) => {
												const ItemIcon = item.icon;
												return (
													<CommandPrimitive.Item
														className={cn(
															"group relative flex cursor-pointer select-none items-center gap-3 rounded px-2 py-2 outline-none",
															"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
														)}
														key={item.path}
														onSelect={() => handleSelect(item)}
														value={`${item.name} ${item.path}`}
													>
														<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent group-data-[selected=true]:bg-background">
															<ItemIcon className="size-4 text-muted-foreground" />
														</div>
														<div className="min-w-0 flex-1">
															<p className="truncate font-medium text-sm leading-tight">
																{item.name}
															</p>
															<p className="truncate text-muted-foreground text-xs">
																{item.path}
															</p>
														</div>
													</CommandPrimitive.Item>
												);
											})}
										</CommandPrimitive.List>
									</CommandPrimitive>
								</Dialog.Body>
							</Dialog.Content>
						</Dialog>
					)}

					{actions && (
						<div className="mt-6 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
							{actions}
						</div>
					)}
				</Card.Content>
			</Card>
		</div>
	);
}

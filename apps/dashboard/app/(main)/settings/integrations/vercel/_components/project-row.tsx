import { authClient } from '@databuddy/auth/client';
import {
	ArrowRightIcon,
	CaretRightIcon,
	CheckCircleIcon,
	GitBranchIcon,
	GlobeIcon,
	PlusIcon,
	TrashIcon,
	WarningIcon,
	XCircleIcon,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { FaviconImage } from '@/components/analytics/favicon-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';
import type { Domain, Project, TriageAction } from './types';

interface ProjectRowProps {
	project: Project;
	isExpanded: boolean;
	onToggle: () => void;
	onCreateWebsite: (domain: Domain) => void;
	onCreateMultipleWebsites: (project: Project, domains: Domain[]) => void;
	integrationStatus?: any;
}

const GitHubIcon = () => (
	<svg
		className="h-4 w-4 flex-shrink-0"
		fill="currentColor"
		viewBox="0 0 24 24"
	>
		<title>GitHub Repository</title>
		<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
	</svg>
);

const StatusBadge = ({ status }: { status: string }) => {
	const badges = {
		integrated: (
			<Badge
				className="flex items-center gap-1 border-border bg-accent text-accent-foreground text-xs"
				variant="outline"
			>
				<CheckCircleIcon className="h-3 w-3" />
				Integrated
			</Badge>
		),
		orphaned: (
			<Badge
				className="flex items-center gap-1 border-border bg-muted text-muted-foreground text-xs"
				variant="outline"
			>
				<WarningIcon className="h-3 w-3" />
				Orphaned
			</Badge>
		),
		invalid: (
			<Badge
				className="flex items-center gap-1 border-destructive/20 bg-destructive/10 text-destructive text-xs"
				variant="outline"
			>
				<XCircleIcon className="h-3 w-3" />
				Invalid
			</Badge>
		),
	};
	return badges[status as keyof typeof badges] || null;
};

const TriageMenu = ({
	domainStatus,
	domain,
	triageIssueMutation,
	onTriageAction,
}: {
	domainStatus: any;
	domain: any;
	triageIssueMutation: any;
	onTriageAction: (
		action: TriageAction,
		domainName: string,
		envVarId?: string,
		websiteId?: string
	) => Promise<void>;
}) => {
	const getTriageActions = (domainStatus: any) => {
		const actions: any[] = [];

		if (domainStatus.status === 'orphaned') {
			actions.push({
				label: 'Remove',
				icon: TrashIcon,
				action: 'remove_orphaned' as const,
			});
		}

		if (
			domainStatus.status === 'invalid' &&
			domainStatus.issues[0]?.includes('Multiple')
		) {
			actions.push({
				label: 'Remove Duplicates',
				icon: TrashIcon,
				action: 'remove_duplicates' as const,
			});
		}

		if (domainStatus.status === 'integrated') {
			actions.push({
				label: 'Unintegrate',
				icon: TrashIcon,
				action: 'unintegrate' as const,
			});
		}

		return actions;
	};

	const actions = getTriageActions(domainStatus);
	if (actions.length === 0) {
		return null;
	}

	if (actions.length === 1) {
		const action = actions[0];
		const Icon = action.icon;
		return (
			<Button
				className="h-5 px-2 text-xs"
				disabled={triageIssueMutation.isPending}
				onClick={(e) => {
					e.stopPropagation();
					onTriageAction(
						action.action,
						domain.name,
						domainStatus.envVarId,
						domainStatus.websiteId
					);
				}}
				size="sm"
				variant="outline"
			>
				<Icon className="mr-1 h-3 w-3" />
				{action.label}
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className="h-5 px-2 text-xs"
					disabled={triageIssueMutation.isPending}
					size="sm"
					variant="outline"
				>
					Fix Issues
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{actions.map((action) => {
					const Icon = action.icon;
					return (
						<DropdownMenuItem
							className="cursor-pointer"
							key={action.action}
							onClick={() => {
								onTriageAction(
									action.action,
									domain.name,
									domainStatus.envVarId,
									domainStatus.websiteId
								);
							}}
						>
							<Icon className="mr-2 h-3 w-3" />
							{action.label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const DomainRow = ({
	domain,
	domainStatus,
	isSelected,
	isIntegrated,
	onSelectionChange,
	onTriageAction,
	onCreateWebsite,
	triageIssueMutation,
}: {
	domain: any;
	domainStatus: any;
	isSelected: boolean;
	isIntegrated: boolean;
	onSelectionChange: (domainName: string, checked: boolean) => void;
	onTriageAction: (
		action: TriageAction,
		domainName: string,
		envVarId?: string,
		websiteId?: string
	) => Promise<void>;
	onCreateWebsite: (domain: any) => void;
	triageIssueMutation: any;
}) => {
	const hasIssues = domainStatus?.issues?.length;

	return (
		<div
			className="border-border/20 border-b bg-muted/10 px-4 py-2 transition-colors hover:bg-muted/20"
			key={domain.name}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Checkbox
						checked={isSelected}
						className="cursor-pointer"
						disabled={isIntegrated}
						onCheckedChange={(checked) =>
							onSelectionChange(domain.name, checked as boolean)
						}
					/>
					<GlobeIcon className="h-3 w-3 text-muted-foreground" />
					<div className="flex flex-col">
						<div className="flex items-center gap-2">
							<span className="font-medium text-sm">{domain.name}</span>
							{!domain.verified && (
								<Badge
									className="border-border bg-muted text-muted-foreground text-xs"
									variant="outline"
								>
									Pending
								</Badge>
							)}
							{domainStatus && <StatusBadge status={domainStatus.status} />}
						</div>
						<div className="mt-0.5 flex flex-wrap items-center gap-3 text-muted-foreground/70 text-xs">
							{isIntegrated &&
								domainStatus?.websiteName &&
								domainStatus?.websiteId && (
									<div className="flex items-center gap-1">
										<span className="text-muted-foreground">→</span>
										<Link
											className="inline-flex items-center gap-1 rounded border border-border bg-accent px-2 py-1 font-medium text-accent-foreground text-xs transition-all hover:border-ring hover:bg-muted hover:shadow-sm"
											href={`/websites/${domainStatus.websiteId}`}
										>
											{domainStatus.websiteName}
											<ArrowRightIcon className="h-3 w-3" weight="bold" />
										</Link>
									</div>
								)}
							{hasIssues && (
								<div className="flex items-center gap-2">
									<span className="text-destructive">
										{domainStatus.length > 1
											? domainStatus.issues.join(', ')
											: domainStatus.issues[0]}
									</span>
									<TriageMenu
										domain={domain}
										domainStatus={domainStatus}
										onTriageAction={onTriageAction}
										triageIssueMutation={triageIssueMutation}
									/>
								</div>
							)}
							{domain.redirect && (
								<span className="flex items-center">
									<ArrowRightIcon className="mr-1 h-2 w-2" />
									Redirects to: {domain.redirect}
									{domain.redirectStatusCode &&
										` (${domain.redirectStatusCode})`}
								</span>
							)}
							{domain.gitBranch && (
								<span className="flex items-center">
									<GitBranchIcon className="mr-1 h-2 w-2" />
									{domain.gitBranch}
								</span>
							)}
							{domain.customEnvironmentId && (
								<Badge
									className="border-muted bg-muted/50 text-muted-foreground text-xs"
									variant="outline"
								>
									{domain.customEnvironmentId}
								</Badge>
							)}
						</div>
					</div>
				</div>
				<Button
					className="h-6 text-xs"
					disabled={isIntegrated}
					onClick={(e) => {
						e.stopPropagation();
						onCreateWebsite(domain);
					}}
					size="sm"
					variant={isIntegrated ? 'secondary' : 'outline'}
				>
					<PlusIcon className="mr-1 h-2 w-2" />
					{isIntegrated ? 'Integrated' : 'Integrate'}
				</Button>
			</div>
		</div>
	);
};

export function ProjectRow({
	project,
	isExpanded,
	onToggle,
	onCreateWebsite,
	onCreateMultipleWebsites,
	integrationStatus,
}: ProjectRowProps) {
	const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
		new Set()
	);

	const { data: activeOrganization } = authClient.useActiveOrganization();

	const { data: domainsData, isLoading: isLoadingDomains } =
		trpc.vercel.getProjectDomains.useQuery(
			{ projectId: project.id },
			{ enabled: isExpanded }
		);

	const triageIssueMutation = trpc.vercel.triageIssue.useMutation();
	const utils = trpc.useUtils();

	const filteredDomains =
		domainsData?.domains?.filter((domain) => {
			if (!domain.redirect) {
				return true;
			}

			// Check if the redirect target exists in the same domain list
			const redirectTargetExists = domainsData.domains.some(
				(otherDomain) =>
					otherDomain.name === domain.redirect &&
					otherDomain.name !== domain.name
			);

			return !redirectTargetExists;
		}) || [];

	const handleDomainSelection = (domainName: string, checked: boolean) => {
		const newSelected = new Set(selectedDomains);
		if (checked) {
			newSelected.add(domainName);
		} else {
			newSelected.delete(domainName);
		}
		setSelectedDomains(newSelected);
	};

	const handleSelectAll = () => {
		const allSelected = selectedDomains.size === filteredDomains.length;
		setSelectedDomains(
			allSelected ? new Set() : new Set(filteredDomains.map((d) => d.name))
		);
	};

	const handleCreateSelected = () => {
		const selectedDomainObjects = filteredDomains.filter((domain) =>
			selectedDomains.has(domain.name)
		);
		if (selectedDomainObjects.length) {
			onCreateMultipleWebsites(project, selectedDomainObjects);
		}
	};

	const unintegrateMutation = trpc.vercel.unintegrate.useMutation();

	const handleTriageAction = async (
		action: TriageAction,
		domainName: string,
		envVarId?: string,
		websiteId?: string
	) => {
		try {
			if (action === 'unintegrate') {
				if (!envVarId) {
					toast.error(
						'Environment variable ID is required for unintegrate action'
					);
					return;
				}
				await unintegrateMutation.mutateAsync({
					projectId: project.id,
					domainName,
					envVarId,
					websiteId,
					deleteWebsite: false, // Default to keeping the website
					organizationId: activeOrganization?.id,
				});
				toast.success(`Successfully unintegrated ${domainName}`);
			} else {
				await triageIssueMutation.mutateAsync({
					projectId: project.id,
					action,
					domainName,
					envVarId,
					websiteId,
					organizationId: activeOrganization?.id,
				});
				toast.success(`Successfully resolved issues for ${domainName}`);
			}

			// Refresh the projects data to show updated status
			await utils.vercel.getProjects.invalidate();
		} catch (error: any) {
			// Handle specific error cases
			if (error?.data?.code === 'UNAUTHORIZED') {
				toast.error(
					'Missing organization permissions. Please check your Vercel integration settings.'
				);
			} else if (error?.data?.code === 'FORBIDDEN') {
				toast.error('Insufficient permissions to perform this action.');
			} else if (error?.data?.code === 'NOT_FOUND') {
				toast.error('Project or domain not found. It may have been deleted.');
			} else if (error?.message) {
				toast.error(error.message);
			} else {
				toast.error('An unexpected error occurred. Please try again.');
			}
		}
	};

	return (
		<motion.div
			animate={{
				backgroundColor: isExpanded
					? 'hsl(var(--muted) / 0.3)'
					: 'hsl(var(--card))',
			}}
			className="overflow-hidden border-b bg-card transition-colors hover:bg-muted/20"
			initial={false}
			transition={{ duration: 0.2 }}
		>
			<div
				className="flex cursor-pointer items-center justify-between p-4"
				onClick={onToggle}
				onKeyUp={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onToggle();
					}
				}}
			>
				<div className="flex items-center">
					<motion.div
						animate={{ rotate: isExpanded ? 90 : 0 }}
						className="mr-3"
						transition={{ duration: 0.2 }}
					>
						<CaretRightIcon className="h-4 w-4 text-muted-foreground" />
					</motion.div>

					{project.primaryDomain ? (
						<div className="mr-3">
							<FaviconImage
								className="size-8"
								domain={project.primaryDomain}
								fallbackIcon={
									<div className="flex h-8 w-8 items-center justify-center rounded bg-muted font-medium text-muted-foreground text-sm">
										{project.name.charAt(0).toUpperCase()}
									</div>
								}
								size={32}
							/>
						</div>
					) : (
						<div className="mr-3 flex h-8 w-8 items-center justify-center rounded bg-muted font-medium text-muted-foreground text-sm">
							{project.name.charAt(0).toUpperCase()}
						</div>
					)}

					<div className="flex flex-col">
						<div className="flex items-center">
							<span className="font-medium text-foreground">
								{project.name}
							</span>
							{project.framework && (
								<Badge className="ml-2 text-xs" variant="secondary">
									{project.framework}
								</Badge>
							)}
							{project.live && (
								<Badge
									className="ml-2 bg-accent text-accent-foreground text-xs"
									variant="default"
								>
									Live
								</Badge>
							)}
						</div>
					</div>
				</div>

				<div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-2 text-muted-foreground text-sm sm:grid-cols-[150px_1fr] sm:gap-4 lg:grid-cols-[200px_1fr]">
					<div className="flex justify-start">
						{project.link?.repo ? (
							<Badge className="max-w-full" variant="outline">
								<div className="flex min-w-0 items-center space-x-1">
									<GitHubIcon />
									<span className="hidden truncate sm:inline">
										{project.link.org}/{project.link.repo}
									</span>
								</div>
							</Badge>
						) : (
							<span className="text-muted-foreground">—</span>
						)}
					</div>

					<div className="hidden justify-center sm:flex">
						{project.link?.productionBranch ? (
							<div className="flex min-w-0 items-center space-x-1">
								<GitBranchIcon className="h-4 w-4 flex-shrink-0" />
								<span className="truncate">
									{project.link.productionBranch}
								</span>
							</div>
						) : (
							<span className="text-muted-foreground">—</span>
						)}
					</div>
				</div>
			</div>

			<AnimatePresence>
				{isExpanded && (
					<motion.div
						animate={{ height: 'auto', opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
					>
						<div className="bg-muted/30">
							{isLoadingDomains ? (
								<div>
									<div className="flex items-center justify-between border-border/20 border-b bg-muted/20 px-4 py-2">
										<div className="flex items-center">
											<GlobeIcon className="mr-2 h-3 w-3 text-muted-foreground" />
											<div className="flex flex-col">
												<Skeleton className="h-4 w-40" />
												<Skeleton className="mt-1 h-3 w-24" />
											</div>
										</div>
										<Skeleton className="h-6 w-16" />
									</div>
								</div>
							) : filteredDomains.length ? (
								<div>
									{filteredDomains.length > 1 && (
										<div className="border-border/20 border-b bg-muted/20 px-4 py-2">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-3">
													<div
														className="flex cursor-pointer items-center gap-2"
														onClick={handleSelectAll}
														onKeyUp={(e) => {
															if (e.key === 'Enter' || e.key === ' ') {
																e.preventDefault();
																handleSelectAll();
															}
														}}
														type="button"
													>
														<Checkbox
															checked={
																selectedDomains.size ===
																	filteredDomains.length &&
																filteredDomains.length > 0
															}
															className="cursor-pointer"
															onCheckedChange={handleSelectAll}
														/>
														<span className="text-muted-foreground text-xs">
															Select All
														</span>
													</div>
													<div className="flex items-center text-muted-foreground text-xs">
														<GlobeIcon className="mr-2 h-3 w-3" />
														<span>
															{filteredDomains.length} domains found
															{integrationStatus?.summary && (
																<>
																	{' • '}
																	<span className="text-accent-foreground">
																		{integrationStatus.summary.integratedCount}{' '}
																		integrated
																	</span>
																	{integrationStatus.summary.orphanedCount >
																		0 && (
																		<>
																			{' • '}
																			<span className="text-muted-foreground">
																				{
																					integrationStatus.summary
																						.orphanedCount
																				}{' '}
																				orphaned
																			</span>
																		</>
																	)}
																	{integrationStatus.summary.invalidCount >
																		0 && (
																		<>
																			{' • '}
																			<span className="text-destructive">
																				{integrationStatus.summary.invalidCount}{' '}
																				invalid
																			</span>
																		</>
																	)}
																</>
															)}
															{selectedDomains.size > 0 &&
																` (${selectedDomains.size} selected)`}
														</span>
													</div>
												</div>
												<div className="flex gap-2">
													{selectedDomains.size > 0 && (
														<Button
															className="h-6 text-xs"
															onClick={(e) => {
																e.stopPropagation();
																handleCreateSelected();
															}}
															size="sm"
															variant="default"
														>
															<PlusIcon className="mr-1 h-2 w-2" />
															Integrate Selected ({selectedDomains.size})
														</Button>
													)}
													<Button
														className="h-6 text-xs"
														onClick={(e) => {
															e.stopPropagation();
															onCreateMultipleWebsites(
																project,
																filteredDomains
															);
														}}
														size="sm"
														variant="outline"
													>
														<PlusIcon className="mr-1 h-2 w-2" />
														Integrate All
													</Button>
												</div>
											</div>
										</div>
									)}

									{filteredDomains.map((domain) => {
										const domainStatus =
											integrationStatus?.integrationStatus?.find(
												(status: any) => status.domain === domain.name
											);
										const isIntegrated = domainStatus?.status === 'integrated';

										return (
											<DomainRow
												domain={domain}
												domainStatus={domainStatus}
												isIntegrated={isIntegrated}
												isSelected={selectedDomains.has(domain.name)}
												key={domain.name}
												onCreateWebsite={onCreateWebsite}
												onSelectionChange={handleDomainSelection}
												onTriageAction={handleTriageAction}
												triageIssueMutation={triageIssueMutation}
											/>
										);
									})}
								</div>
							) : (
								<div className="bg-muted/10 py-4 text-center text-muted-foreground/70 text-xs">
									<span>No domains found for this project</span>
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

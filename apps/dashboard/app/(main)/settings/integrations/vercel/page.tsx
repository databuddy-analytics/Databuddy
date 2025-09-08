'use client';

import {
	ArrowRightIcon,
	CaretRightIcon,
	CheckCircleIcon,
	GitBranchIcon,
	GlobeIcon,
	PlusIcon,
	RocketLaunchIcon,
	UserIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';

interface Project {
	id: string;
	name: string;
	framework?: string | null;
	accountId: string;
	directoryListing: boolean;
	nodeVersion: string;
	live?: boolean;
	createdAt?: number;
	updatedAt?: number;
	link?: {
		type: string;
		repo?: string;
		org?: string;
		productionBranch?: string;
	};
}

interface Domain {
	name: string;
	apexName: string;
	projectId: string;
	redirect?: string | null;
	redirectStatusCode?: number | null;
	gitBranch?: string | null;
	customEnvironmentId?: string | null;
	updatedAt: number;
	createdAt: number;
	verified: boolean;
	verification?: Array<{
		type: string;
		domain: string;
		value: string;
		reason: string;
	}>;
}

function LoadingSkeleton() {
	return (
		<div>
			{[1, 2, 3, 4].map((num) => (
				<div className="border-b bg-card" key={num}>
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center">
							<Skeleton className="mr-4 h-4 w-4" />
							<Skeleton className="h-5 w-32" />
							<Skeleton className="ml-3 h-4 w-16" />
						</div>
						<div className="flex items-center">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="ml-6 h-4 w-24" />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function ErrorState({
	message,
	onRetry,
}: {
	message: string;
	onRetry?: () => void;
}) {
	return (
		<div className="flex h-64 items-center justify-center">
			<div className="text-center">
				<WarningIcon className="mx-auto h-12 w-12 text-destructive" />
				<h3 className="mt-2 font-medium text-foreground text-sm">{message}</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					There was an issue loading your Vercel data. Please try again.
				</p>
				{onRetry && (
					<Button className="mt-4" onClick={onRetry} variant="outline">
						Try Again
					</Button>
				)}
			</div>
		</div>
	);
}

function ProjectRow({
	project,
	isExpanded,
	onToggle,
	onCreateWebsite,
	onCreateMultipleWebsites,
}: {
	project: Project;
	isExpanded: boolean;
	onToggle: () => void;
	onCreateWebsite: (domain: Domain) => void;
	onCreateMultipleWebsites: (project: Project, domains: Domain[]) => void;
}) {
	// Get domains for this project when expanded
	const { data: domainsData, isLoading: isLoadingDomains } =
		trpc.vercel.getProjectDomains.useQuery(
			{ projectId: project.id },
			{ enabled: isExpanded }
		);

	return (
		<motion.div
			animate={{
				backgroundColor: isExpanded
					? 'hsl(var(--muted) / 0.3)'
					: 'hsl(var(--card))',
			}}
			className="overflow-hidden border-b bg-card"
			initial={false}
			transition={{ duration: 0.2 }}
		>
			{/* Project Header Row */}
			<div
				className="flex cursor-pointer items-center justify-between p-4"
				onClick={onToggle}
			>
				<div className="flex items-center">
					<motion.div
						animate={{ rotate: isExpanded ? 90 : 0 }}
						className="mr-4"
						transition={{ duration: 0.2 }}
					>
						<CaretRightIcon className="h-4 w-4 text-muted-foreground" />
					</motion.div>

					<div className="flex items-center">
						<span className="font-semibold text-foreground">
							{project.name}
						</span>
						{project.framework && (
							<Badge className="ml-3 text-xs" variant="secondary">
								{project.framework}
							</Badge>
						)}
						{project.live && (
							<Badge
								className="ml-2 bg-green-100 text-green-800 text-xs"
								variant="default"
							>
								Live
							</Badge>
						)}
					</div>
				</div>

				<div className="flex flex-col text-muted-foreground text-sm">
					<div className="flex items-center">
						{project.link?.repo && (
							<span className="hidden sm:block">
								{project.link.org}/{project.link.repo}
							</span>
						)}
						{project.link?.productionBranch && (
							<span className="ml-4 hidden items-center md:flex">
								<GitBranchIcon className="mr-1 h-3 w-3" />
								{project.link.productionBranch}
							</span>
						)}
						<span className="ml-6 hidden lg:block">
							Node {project.nodeVersion}
						</span>
						<span className="ml-6 font-mono text-xs">
							{project.id.slice(0, 8)}
						</span>
					</div>
					{project.createdAt && (
						<div className="mt-1 text-xs">
							Created {new Date(project.createdAt).toLocaleDateString()}
						</div>
					)}
				</div>
			</div>

			{/* Domains Section */}
			<AnimatePresence>
				{isExpanded && (
					<motion.div
						animate={{ height: 'auto', opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.3, ease: 'easeInOut' }}
					>
						<div className="border-muted border-t-2 bg-muted/10">
							{isLoadingDomains ? (
								<div>
									{[1, 2].map((num) => (
										<div
											className="flex items-center justify-between border-b bg-background/50 px-8 py-3"
											key={num}
										>
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-8 w-24" />
										</div>
									))}
								</div>
							) : domainsData?.domains?.length ? (
								<div>
									{/* Create All Button */}
									{domainsData.domains.length > 1 && (
										<div className="border-b bg-muted/10 px-8 py-3">
											<div className="flex items-center justify-between">
												<div className="flex items-center text-muted-foreground text-sm">
													<GlobeIcon className="mr-2 h-4 w-4" />
													<span>
														{domainsData.domains.length} domains found
													</span>
												</div>
												<Button
													className="h-8"
													onClick={(e) => {
														e.stopPropagation();
														onCreateMultipleWebsites(
															project,
															domainsData.domains
														);
													}}
													size="sm"
													variant="outline"
												>
													<PlusIcon className="mr-1 h-3 w-3" />
													Create All Websites
												</Button>
											</div>
										</div>
									)}

									{domainsData.domains.map((domain) => (
										<div
											className="border-b bg-background/50 px-8 py-4"
											key={domain.name}
										>
											<div className="flex items-center justify-between">
												<div className="flex items-center">
													<GlobeIcon className="mr-3 h-4 w-4 text-muted-foreground" />
													<div className="flex flex-col">
														<div className="flex items-center">
															<span className="font-medium text-sm">
																{domain.name}
															</span>
															{domain.verified ? (
																<Badge
																	className="ml-3 bg-green-100 text-green-800 text-xs"
																	variant="default"
																>
																	<CheckCircleIcon className="mr-1 h-3 w-3" />
																	Verified
																</Badge>
															) : (
																<Badge
																	className="ml-3 bg-yellow-100 text-xs text-yellow-800"
																	variant="secondary"
																>
																	<WarningIcon className="mr-1 h-3 w-3" />
																	Pending
																</Badge>
															)}
														</div>
														<div className="mt-1 flex flex-wrap items-center gap-4 text-muted-foreground text-xs">
															{domain.redirect && (
																<span className="flex items-center">
																	<ArrowRightIcon className="mr-1 h-3 w-3" />
																	Redirects to: {domain.redirect}
																	{domain.redirectStatusCode &&
																		` (${domain.redirectStatusCode})`}
																</span>
															)}
															{domain.gitBranch && (
																<span className="flex items-center">
																	<GitBranchIcon className="mr-1 h-3 w-3" />
																	{domain.gitBranch}
																</span>
															)}
															{domain.customEnvironmentId && (
																<Badge className="text-xs" variant="outline">
																	{domain.customEnvironmentId}
																</Badge>
															)}
															<span>
																Created{' '}
																{new Date(
																	domain.createdAt
																).toLocaleDateString()}
															</span>
														</div>
													</div>
												</div>
												<Button
													className="h-8"
													onClick={(e) => {
														e.stopPropagation();
														onCreateWebsite(domain);
													}}
													size="sm"
												>
													<PlusIcon className="mr-1 h-3 w-3" />
													Create Website
												</Button>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="bg-background/50 py-8 text-center text-muted-foreground text-sm">
									No domains found for this project
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

const generateWebsiteName = (domainName: string) => {
	const cleanDomain = domainName.replace(
		/\.(com|org|net|io|co|dev|app|vercel\.app)$/,
		''
	);
	return cleanDomain
		.split('.')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
};

const inferTargetFromDomain = (domain: Domain): string[] => {
	const name = domain.name.toLowerCase();

	// Check for common staging/preview patterns
	if (
		name.includes('staging') ||
		name.includes('stage') ||
		name.includes('dev')
	) {
		return ['preview', 'development'];
	}
	if (name.includes('preview') || name.includes('test')) {
		return ['preview'];
	}
	if (
		domain.gitBranch &&
		domain.gitBranch !== 'main' &&
		domain.gitBranch !== 'master'
	) {
		return ['preview'];
	}

	// Default to production for main domains
	return ['production', 'preview', 'development'];
};

export default function VercelConfigPage() {
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
		new Set()
	);
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [selectedDomains, setSelectedDomains] = useState<Domain[]>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [websiteConfigs, setWebsiteConfigs] = useState<
		Array<{
			domain: Domain;
			name: string;
			target: string[];
			gitBranch?: string;
		}>
	>([]);
	const [selectedOrganization, setSelectedOrganization] =
		useState<string>('personal');

	// Debug accounts first
	const {
		data: debugData,
		isLoading: isLoadingDebug,
		error: debugError,
	} = trpc.vercel.debugAccounts.useQuery();

	// Get organizations for the selector - using mock data for now
	const organizations: Array<{ id: string; name: string }> = [];

	// Test connection first
	const {
		data: connectionTest,
		isLoading: isTestingConnection,
		error: connectionError,
	} = trpc.vercel.testConnection.useQuery(undefined, {
		enabled: !!debugData?.hasVercelAccount,
	});

	// Get projects - try regardless of connection test since the test might fail due to schema issues
	const {
		data: projectsData,
		isLoading: isLoadingProjects,
		error: projectsError,
	} = trpc.vercel.getProjects.useQuery(
		{ limit: '20' },
		{ enabled: !!debugData?.hasVercelAccount }
	);

	const toggleProjectExpansion = (projectId: string) => {
		const newExpanded = new Set(expandedProjects);
		if (newExpanded.has(projectId)) {
			newExpanded.delete(projectId);
		} else {
			newExpanded.add(projectId);
		}
		setExpandedProjects(newExpanded);
	};

	const handleCreateWebsite = (domain: Domain) => {
		// Single domain creation
		setSelectedDomains([domain]);
		setSelectedProject(null);
		const configs = [
			{
				domain,
				name: generateWebsiteName(domain.name),
				target: ['production', 'preview', 'development'] as string[],
				gitBranch: domain.gitBranch || undefined,
			},
		];
		setWebsiteConfigs(configs);
		setSelectedOrganization('personal');
		setIsDialogOpen(true);
	};

	const handleCreateMultipleWebsites = (
		project: Project,
		domains: Domain[]
	) => {
		// Multiple domains creation for a project
		setSelectedProject(project);
		setSelectedDomains(domains);
		const configs = domains.map((domain) => ({
			domain,
			name: generateWebsiteName(domain.name),
			target: inferTargetFromDomain(domain),
			gitBranch: domain.gitBranch || undefined,
		}));
		setWebsiteConfigs(configs);
		setSelectedOrganization('personal');
		setIsDialogOpen(true);
	};

	const handleConfirmCreate = async () => {
		if (websiteConfigs.length === 0) {
			return;
		}

		setIsCreating(true);
		try {
			// TODO: Implement actual website creation
			// For each website config:
			// 1. Create databuddy website with specific name and domain
			// 2. Add DATABUDDY_CLIENT_ID environment variable to Vercel project with target environments

			console.log('Creating websites for configs:', websiteConfigs);

			// Mock delay
			await new Promise((resolve) => setTimeout(resolve, 2000));

			setIsDialogOpen(false);
		} catch (error) {
			console.error('Failed to create websites:', error);
		} finally {
			setIsCreating(false);
		}
	};

	const updateWebsiteConfig = (
		index: number,
		updates: Partial<(typeof websiteConfigs)[0]>
	) => {
		setWebsiteConfigs((prev) =>
			prev.map((config, i) =>
				i === index ? { ...config, ...updates } : config
			)
		);
	};

	if (isLoadingDebug || isTestingConnection) {
		return <LoadingSkeleton />;
	}

	if (debugError) {
		return <ErrorState message={`Debug error: ${debugError.message}`} />;
	}

	if (!debugData?.hasVercelAccount) {
		return (
			<div className="space-y-6">
				<div className="space-y-3">
					<h1 className="font-semibold text-2xl">Vercel Configuration</h1>
					<p className="text-muted-foreground">
						Manage your Vercel projects and environment variables
					</p>
				</div>
				<ErrorState message="No Vercel account found. Please connect your Vercel account first from the integrations page." />
				<div className="mt-4 rounded-lg bg-muted p-4">
					<h3 className="mb-2 font-medium">Debug Information:</h3>
					<pre className="text-sm">{JSON.stringify(debugData, null, 2)}</pre>
				</div>
			</div>
		);
	}

	// Show connection warning but don't block the UI
	const hasConnectionIssue = connectionError || !connectionTest?.success;

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
				<div className="flex h-24 items-center px-4 sm:px-6">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-4">
							<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
								<RocketLaunchIcon
									className="h-6 w-6 text-primary"
									size={24}
									weight="duotone"
								/>
							</div>
							<div>
								<h1 className="truncate font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
									Vercel Integration
								</h1>
								<p className="mt-1 text-muted-foreground text-sm sm:text-base">
									Connect your Vercel projects to create Databuddy websites
								</p>
							</div>
						</div>
					</div>
					{hasConnectionIssue ? (
						<WarningIcon className="h-6 w-6 text-yellow-600" />
					) : (
						<CheckCircleIcon className="h-6 w-6 text-green-600" />
					)}
				</div>
			</div>

			{/* Content */}
			<main className="flex-1 overflow-y-auto">
				{hasConnectionIssue && (
					<div className="border-yellow-200 border-b bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/50">
						<div className="flex items-start">
							<WarningIcon className="mt-0.5 h-5 w-5 text-yellow-600 dark:text-yellow-400" />
							<div className="ml-3">
								<h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
									Connection Warning
								</h3>
								<p className="text-sm text-yellow-700 dark:text-yellow-300">
									{connectionError?.message || 'Connection test failed'}
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Projects Table */}
				<div>
					{isLoadingProjects ? (
						<LoadingSkeleton />
					) : projectsError ? (
						<ErrorState message="Failed to load projects" />
					) : projectsData?.projects?.length ? (
						<div>
							{projectsData.projects.map((project: Project) => (
								<ProjectRow
									isExpanded={expandedProjects.has(project.id)}
									key={project.id}
									onCreateMultipleWebsites={handleCreateMultipleWebsites}
									onCreateWebsite={handleCreateWebsite}
									onToggle={() => toggleProjectExpansion(project.id)}
									project={project}
								/>
							))}
						</div>
					) : (
						<div className="border-b border-dashed p-12 text-center">
							<RocketLaunchIcon className="mx-auto h-12 w-12 text-muted-foreground" />
							<h3 className="mt-4 font-medium">No projects found</h3>
							<p className="mt-2 text-muted-foreground text-sm">
								Create a project in Vercel to see it here.
							</p>
						</div>
					)}
				</div>
			</main>

			{/* Create Website Dialog */}
			<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
				<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{websiteConfigs.length === 1
								? 'Create Databuddy Website'
								: `Create ${websiteConfigs.length} Databuddy Websites`}
						</DialogTitle>
						<DialogDescription>
							{websiteConfigs.length === 1
								? `Create a new website for ${websiteConfigs[0]?.domain.name} and automatically configure Vercel environment variables.`
								: `Create multiple websites for ${selectedProject?.name} and configure environment variables for each domain.`}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6">
						{/* Organization Selector */}
						<div className="space-y-2">
							<Label htmlFor="organization">Organization</Label>
							<Select
								onValueChange={setSelectedOrganization}
								value={selectedOrganization}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select organization" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="personal">
										<div className="flex items-center">
											<UserIcon className="mr-2 h-4 w-4" />
											<span>Personal</span>
										</div>
									</SelectItem>
									{organizations?.map((org: { id: string; name: string }) => (
										<SelectItem key={org.id} value={org.id}>
											<div className="flex items-center">
												<div className="mr-2 flex h-4 w-4 items-center justify-center rounded bg-primary/20 text-xs">
													{org.name.charAt(0).toUpperCase()}
												</div>
												<span>{org.name}</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Website Configurations */}
						<div className="space-y-4">
							<Label>Website Configurations</Label>
							{websiteConfigs.map((config, index) => (
								<div
									className="rounded-lg border bg-muted/20 p-4"
									key={config.domain.name}
								>
									<div className="space-y-4">
										{/* Domain Header */}
										<div className="flex items-center justify-between">
											<div className="flex items-center">
												<GlobeIcon className="mr-2 h-4 w-4 text-muted-foreground" />
												<span className="font-medium text-sm">
													{config.domain.name}
												</span>
												{config.domain.verified ? (
													<Badge
														className="ml-2 bg-green-100 text-green-800 text-xs"
														variant="default"
													>
														<CheckCircleIcon className="mr-1 h-3 w-3" />
														Verified
													</Badge>
												) : (
													<Badge
														className="ml-2 bg-yellow-100 text-xs text-yellow-800"
														variant="secondary"
													>
														<WarningIcon className="mr-1 h-3 w-3" />
														Pending
													</Badge>
												)}
											</div>
											{config.domain.gitBranch && (
												<Badge className="text-xs" variant="outline">
													<GitBranchIcon className="mr-1 h-3 w-3" />
													{config.domain.gitBranch}
												</Badge>
											)}
										</div>

										{/* Website Name */}
										<div className="space-y-2">
											<Label htmlFor={`name-${index}`}>Website Name</Label>
											<Input
												id={`name-${index}`}
												onChange={(e) =>
													updateWebsiteConfig(index, { name: e.target.value })
												}
												placeholder="Enter website name"
												value={config.name}
											/>
										</div>

										{/* Target Environments */}
										<div className="space-y-2">
											<Label>Target Environments</Label>
											<div className="flex flex-wrap gap-2">
												{['production', 'preview', 'development'].map((env) => (
													<Button
														key={env}
														onClick={() => {
															const newTarget = config.target.includes(env)
																? config.target.filter((t) => t !== env)
																: [...config.target, env];
															updateWebsiteConfig(index, { target: newTarget });
														}}
														size="sm"
														variant={
															config.target.includes(env)
																? 'default'
																: 'outline'
														}
													>
														{env}
													</Button>
												))}
											</div>
										</div>

										{/* Environment Variable Preview */}
										<div className="rounded border bg-background p-3">
											<div className="space-y-2 text-sm">
												<div className="flex items-center justify-between">
													<span className="font-mono text-muted-foreground">
														DATABUDDY_CLIENT_ID
													</span>
													<span className="font-mono text-muted-foreground">
														[Generated]
													</span>
												</div>
												<div className="flex items-center justify-between">
													<span className="text-muted-foreground">
														Targets:
													</span>
													<div className="flex gap-1">
														{config.target.map((env) => (
															<Badge
																className="text-xs"
																key={env}
																variant="outline"
															>
																{env}
															</Badge>
														))}
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>

						{/* Summary */}
						<div className="rounded-lg border bg-blue-50 p-4 dark:bg-blue-950/20">
							<h4 className="mb-2 font-medium text-blue-900 text-sm dark:text-blue-100">
								Summary:
							</h4>
							<ul className="space-y-1 text-blue-800 text-sm dark:text-blue-200">
								<li>
									• Create {websiteConfigs.length} website
									{websiteConfigs.length !== 1 ? 's' : ''} in Databuddy
								</li>
								<li>• Generate unique client IDs for each website</li>
								<li>
									• Add DATABUDDY_CLIENT_ID environment variables to Vercel
								</li>
								<li>• Configure targeting for specific environments</li>
							</ul>
						</div>
					</div>

					<DialogFooter>
						<Button
							disabled={isCreating}
							onClick={() => setIsDialogOpen(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={
								isCreating ||
								websiteConfigs.some((config) => !config.name.trim())
							}
							onClick={handleConfirmCreate}
						>
							{isCreating
								? 'Creating...'
								: `Create ${websiteConfigs.length} Website${websiteConfigs.length !== 1 ? 's' : ''}`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

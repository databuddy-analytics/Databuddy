'use client';

import { authClient } from '@databuddy/auth/client';
import { RocketLaunchIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
	CreateWebsiteDialog,
	type Domain,
	ErrorState,
	LoadingSkeleton,
	type Project,
	ProjectRow,
} from './_components';

export default function VercelConfigPage() {
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
		new Set()
	);
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [selectedDomains, setSelectedDomains] = useState<Domain[]>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const { data: activeOrganization, isPending: isLoadingOrganization } =
		authClient.useActiveOrganization();

	const {
		data: projectsData,
		isLoading: isLoadingProjects,
		error: projectsError,
	} = trpc.vercel.getProjects.useQuery(
		{
			limit: '20',
			includeIntegrationStatus: true,
			organizationId: activeOrganization?.id,
		},
		{ enabled: !isLoadingOrganization }
	);

	const toggleProjectExpansion = (projectId: string) => {
		setExpandedProjects((prev) => {
			const newSet = new Set(prev);
			newSet.has(projectId) ? newSet.delete(projectId) : newSet.add(projectId);
			return newSet;
		});
	};

	const handleCreateWebsite = (domain: Domain) => {
		setSelectedDomains([domain]);
		setSelectedProject(null);
		setIsDialogOpen(true);
	};

	const handleCreateMultipleWebsites = (
		project: Project,
		domains: Domain[]
	) => {
		setSelectedProject(project);
		setSelectedDomains(domains);
		setIsDialogOpen(true);
	};

	const integrateWebsitesMutation = trpc.vercel.integrateWebsites.useMutation();
	const utils = trpc.useUtils();

	const handleSaveWebsites = async (configs: any[]) => {
		try {
			const result = await integrateWebsitesMutation.mutateAsync({
				projectId: selectedProject?.id || selectedDomains[0]?.projectId || '',
				websites: configs.map((config) => ({
					domainName: config.domain.name,
					websiteName: config.name,
					target: config.target,
					domainId: config.domain.id,
					verified: config.domain.verified,
					gitBranch: config.domain.gitBranch,
				})),
				organizationId: activeOrganization?.id,
			});

			if (result.success) {
				await utils.vercel.getProjects.invalidate();
				toast.success(
					`Successfully integrated ${configs.length} website${configs.length > 1 ? 's' : ''}`
				);
			}

			setIsDialogOpen(false);
			setSelectedDomains([]);
			setSelectedProject(null);
		} catch (error: any) {
			// Handle specific error cases
			if (error?.data?.code === 'UNAUTHORIZED') {
				toast.error(
					'Missing organization permissions. Please check your Vercel integration settings.'
				);
			} else if (error?.data?.code === 'FORBIDDEN') {
				toast.error('Insufficient permissions to integrate websites.');
			} else if (error?.data?.code === 'NOT_FOUND') {
				toast.error('Project not found. It may have been deleted.');
			} else if (error?.message) {
				toast.error(error.message);
			} else {
				toast.error('Failed to integrate websites. Please try again.');
			}
		}
	};

	const handleCloseDialog = () => {
		setIsDialogOpen(false);
		setSelectedDomains([]);
		setSelectedProject(null);
	};

	// Handle no Vercel account case through error handling in getProjects
	if (projectsError?.data?.code === 'UNAUTHORIZED') {
		return (
			<div className="space-y-6">
				<div className="space-y-3">
					<h1 className="font-semibold text-2xl">Vercel Configuration</h1>
					<p className="text-muted-foreground">
						Manage your Vercel projects and environment variables
					</p>
				</div>
				<ErrorState message="No Vercel account found. Please connect your Vercel account first from the integrations page." />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
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
									Connect your Vercel projects to integrate Databuddy websites
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<main className="flex-1 overflow-y-auto">
				<div>
					{isLoadingProjects || isLoadingOrganization ? (
						<LoadingSkeleton />
					) : projectsError ? (
						<ErrorState message="Failed to load projects" />
					) : projectsData?.projects?.length ? (
						<div>
							{projectsData.projects.map((project: any) => (
								<ProjectRow
									integrationStatus={project.integrationStatus}
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
								Add a project in Vercel to see it here.
							</p>
						</div>
					)}
				</div>
			</main>

			<CreateWebsiteDialog
				isOpen={isDialogOpen}
				isSaving={integrateWebsitesMutation.isPending}
				onClose={handleCloseDialog}
				onSave={handleSaveWebsites}
				selectedDomains={selectedDomains}
				selectedProject={selectedProject}
			/>
		</div>
	);
}

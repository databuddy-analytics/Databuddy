'use client';

import {
	CheckCircleIcon,
	GitBranchIcon,
	GlobeIcon,
	PlusIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import type { Domain, Project, WebsiteConfig } from './types';
import { generateWebsiteName, generateWebsitePlaceholder } from './utils';

interface CreateWebsiteDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (configs: WebsiteConfig[]) => Promise<void>;
	selectedProject: Project | null;
	selectedDomains: Domain[];
	isSaving: boolean;
}

export function CreateWebsiteDialog({
	isOpen,
	onClose,
	onSave,
	selectedProject,
	selectedDomains,
	isSaving,
}: CreateWebsiteDialogProps) {
	const [websiteConfigs, setWebsiteConfigs] = useState<WebsiteConfig[]>([]);
	const isMultipleMode = selectedDomains.length > 1;

	useEffect(() => {
		if (selectedDomains.length > 0) {
			const configs = selectedDomains.map((domain, index) => {
				let target: string[];

				if (isMultipleMode) {
					if (index === 0) {
						target = ['production'];
					} else {
						target = ['preview'];
					}
				} else {
					target = ['production'];
				}

				return {
					domain,
					name: '',
					target,
				};
			});
			setWebsiteConfigs(configs);
		}
	}, [selectedDomains, isMultipleMode]);

	const handleSubmit = async () => {
		if (websiteConfigs.length === 0) {
			return;
		}

		// Use domain name as default if name is empty
		const configsWithDefaults = websiteConfigs.map((config) => ({
			...config,
			name: config.name.trim() || generateWebsiteName(config.domain.name),
		}));

		await onSave(configsWithDefaults);
	};

	const updateWebsiteConfig = useCallback(
		(index: number, updates: Partial<WebsiteConfig>) => {
			setWebsiteConfigs((prev) =>
				prev.map((config, i) =>
					i === index ? { ...config, ...updates } : config
				)
			);
		},
		[]
	);

	const handleClose = useCallback(() => {
		onClose();
		setWebsiteConfigs([]);
	}, [onClose]);

	const isFormValid = useMemo(() => {
		if (websiteConfigs.length === 0) {
			return false;
		}

		// Each domain must have exactly one target environment
		const hasValidTargets = websiteConfigs.every(
			(config) => config.target.length === 1
		);

		// Only production environment can be used once, preview can be used multiple times
		const productionCount = websiteConfigs.filter((config) =>
			config.target.includes('production')
		).length;
		const hasValidProductionUsage = productionCount <= 1;

		return hasValidTargets && hasValidProductionUsage;
	}, [websiteConfigs]);

	if (selectedDomains.length === 0) {
		return null;
	}

	return (
		<Sheet onOpenChange={handleClose} open={isOpen}>
			<SheetContent
				className="w-full overflow-y-auto p-0 sm:max-w-2xl"
				side="right"
			>
				<div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<SheetHeader className="space-y-3 border-border/50 border-b p-5 pb-3">
						<div className="flex items-start gap-3">
							<div className="rounded border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-2 shadow-sm">
								<GlobeIcon className="h-5 w-5 text-primary" weight="duotone" />
							</div>
							<div className="flex-1 space-y-1">
								<SheetTitle className="font-semibold text-foreground text-xl">
									{isMultipleMode
										? `Integrate ${websiteConfigs.length} Websites`
										: 'Integrate Website'}
								</SheetTitle>
								<SheetDescription className="text-muted-foreground text-sm leading-relaxed">
									{isMultipleMode
										? `Set up Databuddy integration for ${selectedProject?.name} with environment-specific configurations`
										: `Configure Databuddy integration for ${websiteConfigs[0]?.domain.name}`}
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>
				</div>

				<div className="space-y-4 p-5 pt-0">
					{websiteConfigs.map((config, index) => (
						<div
							className="group space-y-4 rounded border border-border/50 bg-gradient-to-br from-card to-card/50 p-4 shadow-sm transition-all hover:border-border hover:shadow-md"
							key={config.domain.name}
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className="rounded bg-gradient-to-br from-muted to-muted/50 p-2 shadow-sm">
										<GlobeIcon
											className="h-4 w-4 text-foreground/70"
											weight="duotone"
										/>
									</div>
									<div className="space-y-1">
										<div className="flex items-center gap-2">
											<span className="font-semibold text-foreground">
												{config.domain.name}
											</span>
											{config.domain.verified ? (
												<Badge
													className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700 text-xs"
													variant="outline"
												>
													<CheckCircleIcon className="mr-1.5 h-3 w-3" />
													Verified
												</Badge>
											) : (
												<Badge
													className="border-amber-200 bg-amber-50 font-medium text-amber-700 text-xs"
													variant="outline"
												>
													<WarningIcon className="mr-1.5 h-3 w-3" />
													Pending
												</Badge>
											)}
										</div>
										{config.domain.gitBranch && (
											<div className="flex items-center gap-2 text-muted-foreground text-sm">
												<GitBranchIcon className="h-3.5 w-3.5" />
												<span>
													Connected to {config.domain.gitBranch} branch
												</span>
											</div>
										)}
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<Label
									className="font-medium text-foreground text-sm"
									htmlFor={`name-${index}`}
								>
									Website Name
								</Label>
								<Input
									className="h-9 rounded border-border/60 bg-background/50 transition-all hover:border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
									id={`name-${index}`}
									onChange={(e) =>
										updateWebsiteConfig(index, { name: e.target.value })
									}
									placeholder={generateWebsitePlaceholder(config.domain.name)}
									value={config.name}
								/>
								<p className="text-muted-foreground text-xs">
									Leave empty to use the domain name as the website name
								</p>
							</div>

							<div className="space-y-3">
								<div className="space-y-1">
									<Label className="font-medium text-foreground text-sm">
										Target Environment
									</Label>
									<p className="text-muted-foreground text-xs leading-relaxed">
										Choose which Vercel environment this website will be
										deployed to. Production is limited to one domain per
										project.
									</p>
								</div>
								<div className="grid grid-cols-2 gap-2">
									{['production', 'preview'].map((env) => {
										const isUsedByOther =
											env === 'production' &&
											websiteConfigs.some(
												(otherConfig, otherIndex) =>
													otherIndex !== index &&
													otherConfig.target.includes(env)
											);
										const isSelected = config.target.includes(env);

										return (
											<Button
												className={`h-10 rounded font-medium text-sm transition-all ${
													isSelected
														? 'border-primary/50 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
														: 'border-border/60 bg-background/50 text-foreground hover:border-border hover:bg-muted/50'
												} ${isUsedByOther && !isSelected ? 'opacity-50' : ''}`}
												disabled={isUsedByOther && !isSelected}
												key={env}
												onClick={() => {
													if (isSelected) {
														updateWebsiteConfig(index, {
															target: config.target.filter((t) => t !== env),
														});
													} else {
														updateWebsiteConfig(index, { target: [env] });
													}
												}}
												variant="outline"
											>
												<div className="flex flex-col items-center">
													<span className="text-foreground capitalize">
														{env}
													</span>
													{isUsedByOther && !isSelected && (
														<span className="text-xs opacity-60">(Used)</span>
													)}
												</div>
											</Button>
										);
									})}
								</div>
								{config.target.length === 0 && (
									<div className="rounded border border-destructive/20 bg-destructive/5 p-2">
										<p className="font-medium text-destructive text-sm">
											Please select an environment for this domain
										</p>
									</div>
								)}
							</div>

							<div className="rounded border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-3">
								<div className="mb-2 flex items-center gap-2">
									<div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" />
									<Label className="font-medium text-foreground text-sm">
										Environment Variable Preview
									</Label>
								</div>
								<div className="space-y-2">
									<div className="flex items-center justify-between rounded bg-background/50 p-2">
										<span className="font-mono text-foreground text-xs">
											NEXT_PUBLIC_DATABUDDY_CLIENT_ID
										</span>
										<Badge
											className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700 text-xs"
											variant="outline"
										>
											Auto-generated
										</Badge>
									</div>
									<div className="flex items-center justify-between">
										<span className="font-medium text-foreground text-xs">
											Target Environments:
										</span>
										<div className="flex gap-1">
											{config.target.length > 0 ? (
												config.target.map((env) => (
													<Badge
														className="bg-primary/20 font-medium text-primary text-xs"
														key={env}
														variant="secondary"
													>
														{env}
													</Badge>
												))
											) : (
												<span className="text-muted-foreground text-xs">
													None selected
												</span>
											)}
										</div>
									</div>
								</div>
							</div>
						</div>
					))}

					<div className="rounded border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<div className="rounded bg-primary/20 p-1.5">
								<CheckCircleIcon
									className="h-4 w-4 text-primary"
									weight="duotone"
								/>
							</div>
							<h4 className="font-medium text-primary">Integration Summary</h4>
						</div>
						<div className="grid gap-2">
							<div className="flex items-center gap-2 rounded bg-background/50 p-2">
								<div className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm" />
								<span className="text-foreground text-sm">
									Create {websiteConfigs.length} website
									{websiteConfigs.length !== 1 ? 's' : ''} in Databuddy
								</span>
							</div>
							<div className="flex items-center gap-2 rounded bg-background/50 p-2">
								<div className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm" />
								<span className="text-foreground text-sm">
									Generate unique client IDs for tracking
								</span>
							</div>
							<div className="flex items-center gap-2 rounded bg-background/50 p-2">
								<div className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm" />
								<span className="text-foreground text-sm">
									Configure NEXT_PUBLIC_DATABUDDY_CLIENT_ID environment
									variables
								</span>
							</div>
						</div>
					</div>
				</div>

				<div className="sticky bottom-0 border-border/50 border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<div className="flex justify-end gap-3">
						<Button
							className="h-9 rounded px-4 font-medium transition-all hover:bg-muted/80"
							disabled={isSaving}
							onClick={handleClose}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="relative h-9 rounded bg-gradient-to-r from-primary to-primary/90 px-4 font-medium shadow-sm transition-all hover:from-primary/90 hover:to-primary hover:shadow-md disabled:opacity-50"
							disabled={!isFormValid || isSaving}
							onClick={handleSubmit}
						>
							{isSaving && (
								<div className="absolute left-3">
									<div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
								</div>
							)}
							<span className={isSaving ? 'ml-6' : 'flex items-center gap-2'}>
								{isSaving ? (
									'Integrating...'
								) : (
									<>
										<PlusIcon className="h-3 w-3" />
										Integrate {websiteConfigs.length} Website
										{websiteConfigs.length !== 1 ? 's' : ''}
									</>
								)}
							</span>
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

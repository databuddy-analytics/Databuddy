"use client";

import {
	BUSINESS_CONTEXT_LIMIT,
	BUSINESS_CONTEXT_TEAM_FIELD_LIMIT,
	type BusinessContextEdit,
	type BusinessTeamContext,
	type OrganizationBusinessProfile,
	type BusinessContextSettings,
	businessContextIsGenerating,
	businessMeasurementPlansSchema,
	businessContextSourceUrlsSchema,
	businessContextSourceBelongsToSite,
} from "@databuddy/shared/organization-business-context";
import {
	Button,
	Card,
	Field,
	Textarea,
	SegmentedControl,
	Skeleton,
	Spinner,
	Badge,
	dayjs,
} from "@databuddy/ui";
import { DropdownMenu, Tabs } from "@databuddy/ui/client";
import {
	CaretDownIcon,
	FloppyDiskIcon,
	WandSparkleIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/top-bar";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import type { orpc } from "@/lib/orpc";
import {
	BusinessContextBriefHeader,
	BusinessContextSourceInput,
} from "./business-context-layout";
import { useBusinessContextDraft } from "./use-business-context-draft";
import { MeasurementPlanEditor } from "./measurement-plan-editor";
import {
	BusinessContextMarkdown,
	BusinessContextResearchReport,
	BusinessContextSources,
	BusinessContextVersion,
} from "./business-context-content";

const emptyTeamContext: BusinessTeamContext = {
	priority: "",
	successDefinition: "",
	exclusions: "",
};
const teamFields = [
	{
		key: "priority",
		label: "Current priority",
		description: "The customer outcome your team is focused on improving.",
	},
	{
		key: "successDefinition",
		label: "How you define success",
		description:
			"What does a successful customer actually do? Include relevant event names if you know them.",
	},
	{
		key: "exclusions",
		label: "Things to exclude or account for",
		description:
			"Internal testing, seasonal demand, known incidents, or other context.",
	},
] as const;
type Review =
	| { kind: "generation" | "conflict" }
	| {
			kind: "history";
			profile: OrganizationBusinessProfile;
			baseRevision: number;
	  };
interface BusinessContextEditorProps {
	access?: Awaited<
		ReturnType<typeof orpc.businessContext.generationAccess.call>
	>;
	accessPending: boolean;
	onCancel: (generationId?: string) => Promise<void>;
	onGenerate: (websiteId: string, sourceUrls: string[]) => Promise<void>;
	onRefreshAccess: () => void;
	onRestore: (restoreRevision: number, revision: number) => Promise<void>;
	onSave: (draft: BusinessContextEdit) => Promise<void>;
	settings: BusinessContextSettings;
	storageKey: string;
}

export function BusinessContextEditor({
	settings,
	onGenerate,
	onSave,
	onCancel,
	onRestore,
	storageKey,
	access,
	accessPending,
	onRefreshAccess,
}: BusinessContextEditorProps) {
	const { profile, generation, canEdit, websites } = settings;
	const {
		draft,
		updateDraft: setDraft,
		clearDraft: clearSubmittedDraft,
		ready,
		recoverable,
		research,
		updateResearch,
	} = useBusinessContextDraft(storageKey, canEdit);
	const websiteId = research?.websiteId ?? generation?.websiteId;
	const [isSaving, setIsSaving] = useState(false);
	const [isRequesting, setIsRequesting] = useState(false);
	const [error, setError] = useState<string>();
	const [generationError, setGenerationError] = useState<string>();
	const [notice, setNotice] = useState("");
	const [settledGenerationId, setSettledGenerationId] = useState<string>();
	const [reviewVersion, setReviewVersion] = useState("proposed");
	const [review, setReview] = useState<Review | null>(null);
	const [showAllTeamFields, setShowAllTeamFields] = useState(false);
	const [showSourceInput, setShowSourceInput] = useState(false);
	const editorRef = useRef<HTMLTextAreaElement>(null);
	const [view, setView] = useState(
		canEdit && !profile?.content ? "edit" : "preview"
	);
	const sourceText =
		research?.sourceText ?? (generation?.sourceUrls ?? []).join("\n");
	const pageRef = useRef<HTMLDivElement>(null);
	const reviewWasOpen = useRef(false);
	const reviewTitleRef = useRef<HTMLHeadingElement>(null);
	const savingRef = useRef(false);
	const requestingRef = useRef(false);
	const previousGenerationId = useRef<string | undefined>(undefined);
	const revision = profile?.revision ?? 0;
	const content = draft?.content ?? profile?.content ?? "";
	const teamContext =
		draft?.teamContext ?? profile?.teamContext ?? emptyTeamContext;
	const measurementPlans =
		draft?.measurementPlans ?? profile?.measurementPlans ?? [];
	const generationWebsite = websites.find(
		(site) =>
			site.id === generation?.websiteId && site.domain === generation.domain
	);
	const draftGeneration = [generation, ...(settings.previousDrafts ?? [])].find(
		(item) =>
			item?.status === "ready" &&
			item.id === draft?.generationId &&
			websites.some(
				(site) => site.id === item.websiteId && site.domain === item.domain
			)
	);
	const dirty =
		draft !== null &&
		(content.trim() !== (profile?.content ?? "") ||
			Boolean(draftGeneration) ||
			teamFields.some(
				({ key }) =>
					teamContext[key].trim() !== (profile?.teamContext?.[key] ?? "").trim()
			) ||
			JSON.stringify(measurementPlans) !==
				JSON.stringify(profile?.measurementPlans ?? []));
	const conflict = dirty && draft.revision !== revision;
	const awaitingGeneration =
		(isRequesting || !!generationError) &&
		generation?.id === previousGenerationId.current;
	const currentGeneration =
		!awaitingGeneration && generation?.id !== settledGenerationId
			? generation
			: undefined;
	const activeGeneration = businessContextIsGenerating(settings);
	const generating = isRequesting || activeGeneration;
	const failedGeneration =
		!generating && currentGeneration?.status === "failed"
			? currentGeneration
			: null;
	const readyGeneration =
		currentGeneration?.status === "ready" &&
		generationWebsite &&
		currentGeneration.draft
			? currentGeneration
			: null;
	const pendingDraft =
		!generating && readyGeneration && readyGeneration.id !== draft?.generationId
			? readyGeneration
			: null;
	const selectedWebsite =
		websites.find(
			(site) =>
				site.id === (activeGeneration ? generation?.websiteId : websiteId)
		) ??
		websites.find((site) => site.id === profile?.sourceWebsiteId) ??
		websites[0];
	const tooLong = content.trim().length > BUSINESS_CONTEXT_LIMIT;
	const teamTooLong = Object.values(teamContext).some(
		(value) => value.trim().length > BUSINESS_CONTEXT_TEAM_FIELD_LIMIT
	);
	const plansValid =
		businessMeasurementPlansSchema.safeParse(measurementPlans).success;
	const bindingsValid = measurementPlans.every((plan) =>
		websites.some(
			(site) => site.id === plan.websiteId && site.domain === plan.domain
		)
	);
	const saveDisabled =
		!(ready && canEdit && dirty) ||
		conflict ||
		tooLong ||
		teamTooLong ||
		!plansValid ||
		!bindingsValid ||
		isSaving ||
		review !== null;
	const reviewedProfile = review?.kind === "history" ? review.profile : profile;
	const reviewText =
		review?.kind === "generation"
			? (pendingDraft?.draft?.content ?? "")
			: (reviewedProfile?.content ?? "");
	const reviewTeam =
		review?.kind === "generation" ? undefined : reviewedProfile?.teamContext;
	const reviewPlans =
		review?.kind === "generation"
			? measurementPlans
			: reviewedProfile?.measurementPlans;

	const sourceResult = businessContextSourceUrlsSchema.safeParse(
		sourceText
			.split("\n")
			.map((value) => value.trim())
			.filter(Boolean)
	);
	const invalidSource =
		sourceResult.success &&
		selectedWebsite &&
		sourceResult.data.some(
			(url) => !businessContextSourceBelongsToSite(url, selectedWebsite.domain)
		);
	const sourceError = sourceResult.success
		? invalidSource
			? "Use pages on the selected website or its subdomains, such as your docs site."
			: undefined
		: "Add up to six valid public page URLs, one per line.";
	const canGenerate =
		ready &&
		canEdit &&
		!!selectedWebsite &&
		access?.status === "allowed" &&
		!accessPending &&
		!generating &&
		!isSaving &&
		!sourceError;
	const reviewTitle =
		review?.kind === "history"
			? `Review version ${review.profile.revision}`
			: review?.kind === "generation"
				? "Review AI draft"
				: "Review saved changes";
	const liveText = currentGeneration?.progress?.content ?? "";
	const displayedDraft = readyGeneration?.draft?.content ?? liveText;
	const researchError = failedGeneration?.error || generationError;
	const hasGeneratedContent =
		generating || !!readyGeneration || !!failedGeneration || !!generationError;
	const reportGeneration =
		generating || view === "draft"
			? currentGeneration
			: (draftGeneration ?? currentGeneration);
	const report = reportGeneration
		? reportGeneration.research
		: generating
			? undefined
			: profile?.research;
	const questionBrief = draftGeneration
		? draftGeneration.draft
		: readyGeneration
			? readyGeneration.draft
			: profile;
	const questions = generating ? [] : (questionBrief?.followUpQuestions ?? []);
	const hiddenTeamFields = teamFields.filter(
		({ key }) =>
			!(
				teamContext[key].trim() ||
				(canEdit &&
					!profile?.teamContext?.[key]?.trim() &&
					questions.some(({ field }) => field === key))
			)
	).length;
	useEffect(() => {
		if (review) {
			reviewWasOpen.current = true;
			reviewTitleRef.current?.focus();
		} else if (reviewWasOpen.current) {
			const target =
				view === "edit"
					? editorRef.current
					: pageRef.current?.querySelector<HTMLButtonElement>(
							'[role="tab"][aria-selected="true"]'
						);
			if (target) {
				reviewWasOpen.current = false;
				target.focus();
			}
		}
	}, [review, view]);
	useEffect(() => {
		if (view === "edit") {
			editorRef.current?.focus();
		}
	}, [view]);
	useEffect(() => {
		if (view === "draft" && isRequesting) {
			pageRef.current
				?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
				?.focus();
		}
	}, [view, isRequesting]);
	useEffect(() => {
		if (view === "draft" && !hasGeneratedContent) {
			setView("preview");
		}
	}, [view, hasGeneratedContent]);
	async function change(
		action: () => Promise<void>,
		message: string,
		clearDraft = true
	) {
		if (savingRef.current || !canEdit) {
			return;
		}
		savingRef.current = true;
		setIsSaving(true);
		setError(undefined);
		setNotice("");
		try {
			// The query cache notifies React asynchronously. Block the old result
			// while its successful cancellation/save response reaches this render.
			await action();
			setSettledGenerationId(generation?.id);
			setGenerationError(undefined);
			if (clearDraft) {
				clearSubmittedDraft(draft);
			}
			setNotice(message);
			setReview(null);
		} catch (cause) {
			setError(
				getUserFacingErrorMessage(
					cause,
					"Couldn't save this change. Your edits are still here."
				)
			);
		} finally {
			savingRef.current = false;
			setIsSaving(false);
		}
	}

	function discard() {
		return change(async () => {
			if (generation) {
				await onCancel(generation.id);
			}
			if (draftGeneration && draftGeneration.id !== generation?.id) {
				await onCancel(draftGeneration.id);
			}
		}, "");
	}

	async function save() {
		if (saveDisabled || !draft || savingRef.current) {
			return;
		}
		await change(
			() =>
				onSave({
					content: content.trim(),
					revision: draft.revision,
					teamContext,
					measurementPlans,
					...(draftGeneration ? { generationId: draftGeneration.id } : {}),
				}),
			"Changes saved"
		);
	}

	async function generate() {
		if (
			requestingRef.current ||
			!(canGenerate && selectedWebsite && sourceResult.success)
		) {
			return;
		}
		requestingRef.current = true;
		previousGenerationId.current = generation?.id;
		setGenerationError(undefined);
		updateResearch({ websiteId: selectedWebsite.id, sourceText });
		setIsRequesting(true);
		setView("draft");
		setError(undefined);
		setNotice("");
		try {
			await onGenerate(selectedWebsite.id, sourceResult.data);
		} catch (cause) {
			setGenerationError(
				getUserFacingErrorMessage(
					cause,
					"Research could not be completed. Your edits are still here. Try again."
				)
			);
		} finally {
			requestingRef.current = false;
			setIsRequesting(false);
			onRefreshAccess();
		}
	}

	function researchButton() {
		if (generating) {
			return (
				<Button
					disabled={isSaving}
					onClick={() => {
						if (activeGeneration && generation) {
							return change(
								() => onCancel(generation.id),
								"Generation cancelled",
								false
							);
						}
						return onCancel();
					}}
					size="sm"
					variant="secondary"
				>
					Cancel generation
				</Button>
			);
		}
		if (!selectedWebsite) {
			return (
				<Button asChild size="sm" variant="secondary">
					<Link href="/websites">Add a website</Link>
				</Button>
			);
		}
		if (!accessPending && access?.action === "billing") {
			return (
				<Button asChild size="sm" variant="secondary">
					<Link href="/billing">Manage billing</Link>
				</Button>
			);
		}
		if (!accessPending && access?.status !== "allowed") {
			return (
				<Button onClick={onRefreshAccess} size="sm" variant="secondary">
					Check again
				</Button>
			);
		}
		return (
			<Button
				disabled={!canGenerate}
				onClick={generate}
				size="sm"
				variant="secondary"
			>
				{isRequesting ? (
					<Spinner aria-hidden size="sm" />
				) : (
					<WandSparkleIcon className="size-4" />
				)}
				{isRequesting
					? "Starting draft…"
					: content.trim() || profile
						? "Regenerate with AI"
						: "Generate with AI"}
			</Button>
		);
	}

	const researchAction = (
		<div
			className="flex items-center gap-1"
			data-testid="business-context-research"
		>
			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Research options"
					render={
						<Button
							disabled={!ready || generating || isSaving}
							size="icon-sm"
							variant="ghost"
						/>
					}
				>
					<CaretDownIcon className="size-3 shrink-0" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					{websites.length > 1 && (
						<DropdownMenu.Group>
							<DropdownMenu.GroupLabel>
								Generate from website
							</DropdownMenu.GroupLabel>
							<DropdownMenu.RadioGroup
								onValueChange={(websiteId) =>
									updateResearch({ websiteId, sourceText })
								}
								value={selectedWebsite?.id}
							>
								{websites.map((site) => (
									<DropdownMenu.RadioItem key={site.id} value={site.id}>
										{site.name || site.domain}
									</DropdownMenu.RadioItem>
								))}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Group>
					)}
					<DropdownMenu.Item
						disabled={!selectedWebsite}
						onClick={() => setShowSourceInput(true)}
					>
						Add specific pages
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu>
			{researchButton()}
		</div>
	);

	const briefSources =
		view === "draft"
			? (readyGeneration?.draft?.sources ?? [])
			: (draftGeneration?.draft?.sources ?? profile?.sources ?? []);

	const researchStatus = generating ? (
		<p className="text-muted-foreground">
			{generation?.progress?.stage === "writing"
				? "Writing your draft."
				: "Reading your sources."}{" "}
			Saving or leaving this page stops research.
		</p>
	) : failedGeneration ? (
		<>
			<p className="min-w-0 flex-1 text-destructive">
				{failedGeneration.error ||
					"The draft could not be completed. Your saved brief is unchanged. Try again."}
			</p>
			<Button
				aria-label="Dismiss generation error"
				className="shrink-0"
				disabled={isSaving}
				onClick={() =>
					change(
						() => onCancel(failedGeneration.id),
						"Generation error dismissed",
						false
					)
				}
				size="icon-sm"
				variant="ghost"
			>
				<XMarkIcon aria-hidden className="size-4" />
			</Button>
		</>
	) : selectedWebsite && !accessPending && access?.status !== "allowed" ? (
		<p>{access?.message}</p>
	) : null;

	return (
		<div className="space-y-4" ref={pageRef}>
			{canEdit && (
				<TopBar.Actions>
					<Button
						aria-label="Discard changes"
						disabled={isSaving || !(dirty || draft)}
						onClick={discard}
						size="sm"
						variant="ghost"
					>
						Discard<span className="hidden sm:inline"> changes</span>
					</Button>
					<Button
						aria-label="Save changes"
						disabled={saveDisabled}
						loading={isSaving}
						keyboard={{
							display: "⌘S",
							trigger: (event) =>
								(event.metaKey || event.ctrlKey) &&
								event.key.toLowerCase() === "s",
							callback: save,
						}}
						onClick={save}
						size="sm"
					>
						<FloppyDiskIcon className="hidden size-4 sm:block" />
						Save<span className="hidden sm:inline"> changes</span>
					</Button>
				</TopBar.Actions>
			)}
			<div className="flex min-w-0 flex-col gap-4">
				<Card className="min-w-0" data-testid="business-context-brief">
					<BusinessContextBriefHeader>
						<div className="flex items-center gap-2">
							<Badge variant={dirty ? "warning" : "muted"}>
								{dirty ? "Unsaved changes" : profile ? "Saved" : "Not set up"}
							</Badge>
							{canEdit && researchAction}
						</div>
					</BusinessContextBriefHeader>
					{canEdit && (showSourceInput || sourceText.trim() || sourceError) && (
						<div className="border-border border-b px-5 py-3">
							<BusinessContextSourceInput
								value={sourceText}
								onChange={(sourceText) =>
									updateResearch({
										websiteId: selectedWebsite?.id,
										sourceText,
									})
								}
								readOnly={!ready || generating || isSaving || !selectedWebsite}
								error={sourceError}
							/>
						</div>
					)}
					{canEdit && researchStatus && (
						<div
							aria-live="polite"
							className="flex items-start gap-2 border-border border-b px-5 py-2 text-xs leading-5"
							role="status"
						>
							{researchStatus}
						</div>
					)}
					{review ? (
						<section aria-labelledby="business-context-review-title">
							<div className="space-y-2 border-border border-b px-5 py-4">
								<h2
									id="business-context-review-title"
									ref={reviewTitleRef}
									tabIndex={-1}
									className="font-semibold text-base outline-none"
								>
									{reviewTitle}
								</h2>
								<p className="text-muted-foreground text-xs leading-5">
									{review.kind === "generation"
										? "Compare the proposed brief with your current work. Using the draft keeps your team priorities and event definitions; save when you are ready."
										: review.kind === "history"
											? "Restoring this version replaces the brief, team context, and event definitions. Your current saved version stays in history."
											: "Someone saved a newer version. Your edits are still here. Choose which version to continue with."}
								</p>
								{review.kind === "generation" &&
									pendingDraft?.baseRevision !== revision && (
										<p className="text-warning text-xs">
											This draft predates the latest saved version. Check any
											recent corrections before using it.
										</p>
									)}
							</div>
							<div className="border-border border-b px-5 py-3 md:hidden">
								<SegmentedControl
									aria-label="Version to review"
									options={[
										{ value: "current", label: "Current version" },
										{ value: "proposed", label: "Proposed version" },
									]}
									value={reviewVersion}
									onChange={setReviewVersion}
								/>
							</div>
							<div className="grid max-h-144 divide-y divide-border overflow-y-auto md:grid-cols-2 md:divide-x md:divide-y-0">
								<BusinessContextVersion
									label="Current version"
									className={
										reviewVersion === "current" ? "" : "hidden md:block"
									}
									sources={
										draftGeneration?.draft?.sources ?? profile?.sources ?? []
									}
									value={{ content, revision, teamContext, measurementPlans }}
								/>
								<BusinessContextVersion
									label="Proposed version"
									className={
										reviewVersion === "proposed" ? "" : "hidden md:block"
									}
									sources={
										review.kind === "generation"
											? (pendingDraft?.draft?.sources ?? [])
											: (reviewedProfile?.sources ?? [])
									}
									value={{
										content: reviewText,
										revision,
										teamContext: reviewTeam,
										measurementPlans: reviewPlans,
									}}
								/>
							</div>
							<div className="flex flex-wrap items-center justify-end gap-2 border-border border-t p-4">
								<Button
									size="sm"
									variant="ghost"
									disabled={isSaving}
									onClick={() => setReview(null)}
								>
									Back to brief
								</Button>
								{review.kind === "generation" ? (
									<>
										<Button
											size="sm"
											variant="secondary"
											disabled={isSaving}
											onClick={() =>
												pendingDraft &&
												change(
													() => onCancel(pendingDraft.id),
													"AI draft discarded",
													false
												)
											}
										>
											Keep current text
										</Button>
										<Button
											size="sm"
											disabled={!(canEdit && pendingDraft?.draft) || isSaving}
											onClick={() => {
												if (!pendingDraft?.draft) {
													return;
												}
												setDraft({
													content: pendingDraft.draft.content,
													revision: Math.min(
														draft?.revision ?? revision,
														pendingDraft.baseRevision
													),
													generationId: pendingDraft.id,
													teamContext,
													measurementPlans,
												});
												setReview(null);
												setView("preview");
												setNotice(
													"AI draft selected. Save to use it in your analyses."
												);
											}}
										>
											Use AI draft
										</Button>
									</>
								) : review.kind === "history" ? (
									<Button
										size="sm"
										disabled={!canEdit || isSaving}
										onClick={() =>
											change(
												() =>
													onRestore(
														review.profile.revision,
														review.baseRevision
													),
												"Version restored"
											)
										}
									>
										Restore this version
									</Button>
								) : (
									<>
										<Button
											size="sm"
											variant="secondary"
											disabled={isSaving}
											onClick={discard}
										>
											Use saved version
										</Button>
										<Button
											size="sm"
											disabled={!canEdit || isSaving}
											onClick={() => {
												setDraft(draft ? { ...draft, revision } : null);
												setError(undefined);
												setReview(null);
											}}
										>
											Keep editing my version
										</Button>
									</>
								)}
							</div>
						</section>
					) : (
						<Tabs
							value={view}
							onValueChange={(value) => setView(String(value))}
						>
							<div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-border border-b px-5">
								<Tabs.List className="border-0">
									<Tabs.Tab value="preview">Preview</Tabs.Tab>
									{canEdit && <Tabs.Tab value="edit">Edit</Tabs.Tab>}
									{hasGeneratedContent && (
										<Tabs.Tab value="draft">AI draft</Tabs.Tab>
									)}
								</Tabs.List>
								{Boolean(settings.history?.length) && (
									<DropdownMenu>
										<DropdownMenu.Trigger
											render={<Button size="sm" variant="ghost" />}
										>
											History
											<CaretDownIcon className="size-3" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Group>
												<DropdownMenu.GroupLabel>
													Previous saved versions
												</DropdownMenu.GroupLabel>
												{settings.history?.toReversed().map((previous) => (
													<DropdownMenu.Item
														key={previous.revision}
														onClick={() =>
															setReview({
																kind: "history",
																profile: previous,
																baseRevision: revision,
															})
														}
													>
														Version {previous.revision} ·{" "}
														{dayjs(previous.updatedAt).format("MMM D, h:mm A")}
													</DropdownMenu.Item>
												))}
											</DropdownMenu.Group>
										</DropdownMenu.Content>
									</DropdownMenu>
								)}
							</div>
							<Tabs.Panel
								value="preview"
								data-testid="business-context-document"
								className="max-h-96 overflow-y-auto p-5 sm:p-6"
							>
								{content.trim() ? (
									<BusinessContextMarkdown content={content} />
								) : (
									<div className="flex h-full flex-col items-start justify-center gap-4">
										<div className="space-y-2">
											<h2 className="font-medium text-base">
												Give your analytics some context
											</h2>
											<p className="max-w-md text-muted-foreground text-sm leading-6">
												Describe what you offer, who uses it, and how they get
												value. Databuddy can also read your website to prepare a
												draft.
											</p>
										</div>
										{!canEdit && (
											<p className="text-muted-foreground text-sm">
												An organization admin can add your business context.
											</p>
										)}
									</div>
								)}
							</Tabs.Panel>
							{canEdit && (
								<Tabs.Panel
									value="edit"
									className="max-h-96 overflow-y-auto p-5"
								>
									<Field error={tooLong} className="h-full">
										<Field.Label>Business brief</Field.Label>
										<Field.Description>
											Describe your product, customers, and business model.
											Markdown is supported.
										</Field.Description>
										<Textarea
											className="min-h-56 flex-1 font-mono text-sm leading-6"
											minRows={8}
											maxRows={8}
											readOnly={!(ready && canEdit) || isSaving}
											ref={editorRef}
											value={content}
											onChange={(event) => {
												setDraft({
													...(draft ?? {
														revision,
														teamContext,
														measurementPlans,
													}),
													content: event.target.value,
												});
												setNotice("");
											}}
										/>
										{tooLong && (
											<Field.Error>
												Keep the brief under{" "}
												{BUSINESS_CONTEXT_LIMIT.toLocaleString()} characters (
												{content.trim().length.toLocaleString()} used).
											</Field.Error>
										)}
									</Field>
								</Tabs.Panel>
							)}
							{hasGeneratedContent && (
								<Tabs.Panel
									value="draft"
									className="max-h-96 overflow-y-auto p-5 sm:p-6"
									aria-label="AI draft preview"
								>
									{researchError || failedGeneration ? (
										<div className="space-y-2" role="alert">
											<p className="font-medium text-sm">
												Research could not be completed
											</p>
											<p className="text-muted-foreground text-sm leading-6">
												{researchError ||
													"The draft could not be completed. Try again."}
											</p>
											<p className="text-muted-foreground text-xs leading-5">
												Your brief and team answers are unchanged. You can try
												again when you are ready.
											</p>
										</div>
									) : displayedDraft ? (
										<BusinessContextMarkdown
											content={displayedDraft}
											streaming={generating}
										/>
									) : (
										<div className="space-y-6" role="status">
											<div className="flex items-start gap-3">
												<Spinner
													size="sm"
													className="mt-1 shrink-0 text-muted-foreground"
													aria-hidden
												/>
												<div className="space-y-1">
													<p className="font-medium text-sm">
														Reading your sources
													</p>
													<p className="text-muted-foreground text-xs leading-5">
														The draft will appear here as it is written. Your
														saved brief stays unchanged.
													</p>
												</div>
											</div>
											<div className="space-y-3" aria-hidden>
												<Skeleton className="h-4 w-2/5" />
												<Skeleton className="h-3 w-full" />
												<Skeleton className="h-3 w-5/6" />
												<Skeleton className="h-3 w-2/3" />
											</div>
										</div>
									)}
								</Tabs.Panel>
							)}
						</Tabs>
					)}
					<div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-border border-t px-5 py-2">
						<div
							className="min-w-0 text-muted-foreground text-xs"
							aria-live="polite"
						>
							{error ? (
								<p className="text-destructive" role="alert">
									{error}
								</p>
							) : conflict ? (
								<p>
									A newer version was saved. Review it before saving your edits.
								</p>
							) : notice ? (
								<p>{notice}</p>
							) : dirty ? (
								<p>
									{recoverable
										? "Unsaved changes · Kept in this tab"
										: "Unsaved changes · Save before closing this tab"}
								</p>
							) : profile ? (
								<time dateTime={profile.updatedAt}>
									Last saved {dayjs(profile.updatedAt).fromNow()}
								</time>
							) : (
								<p>No saved brief yet</p>
							)}
						</div>
						{briefSources.length > 0 && (
							<details className="min-w-0">
								<summary className="cursor-pointer text-muted-foreground text-xs">
									{briefSources.length} source
									{briefSources.length > 1 ? "s" : ""}
								</summary>
								<div className="pt-2">
									<BusinessContextSources sources={briefSources} />
								</div>
							</details>
						)}
						{conflict && canEdit ? (
							<Button
								size="sm"
								variant="secondary"
								onClick={() => setReview({ kind: "conflict" })}
							>
								Review update
							</Button>
						) : pendingDraft && canEdit && !review ? (
							<Button
								size="sm"
								variant="secondary"
								onClick={() => setReview({ kind: "generation" })}
							>
								Review AI draft
							</Button>
						) : null}
					</div>
				</Card>
				<Card className="order-3 min-w-0">
					<Card.Header>
						<Card.Title>What matters to your team</Card.Title>
						<Card.Description>
							Kept when you regenerate. All optional.
						</Card.Description>
					</Card.Header>
					<Card.Content className="space-y-4">
						{teamFields.map(({ key, label, description }) => {
							const question =
								canEdit && !profile?.teamContext?.[key]?.trim()
									? questions.find(({ field }) => field === key)?.question
									: undefined;
							if (!(question || teamContext[key].trim() || showAllTeamFields)) {
								return null;
							}
							return (
								<Field
									key={key}
									error={
										teamContext[key].trim().length >
										BUSINESS_CONTEXT_TEAM_FIELD_LIMIT
									}
								>
									<Field.Label>{label}</Field.Label>
									<Field.Description>
										{question ?? description}
									</Field.Description>
									{question && teamContext[key].trim() && (
										<p className="text-muted-foreground text-xs">
											Answer not saved
										</p>
									)}
									<Textarea
										value={teamContext[key]}
										minRows={2}
										maxRows={4}
										readOnly={!(ready && canEdit) || isSaving}
										onChange={(event) => {
											setDraft({
												...(draft ?? { content, revision, measurementPlans }),
												teamContext: {
													...teamContext,
													[key]: event.target.value,
												},
											});
											setNotice("");
										}}
									/>
									{teamContext[key].trim().length >
										BUSINESS_CONTEXT_TEAM_FIELD_LIMIT && (
										<Field.Error>
											Keep this under{" "}
											{BUSINESS_CONTEXT_TEAM_FIELD_LIMIT.toLocaleString()}{" "}
											characters.
										</Field.Error>
									)}
								</Field>
							);
						})}
						{canEdit && !showAllTeamFields && hiddenTeamFields > 0 && (
							<Button
								onClick={() => setShowAllTeamFields(true)}
								size="sm"
								variant="ghost"
							>
								Add {hiddenTeamFields} more detail
								{hiddenTeamFields > 1 ? "s" : ""}
							</Button>
						)}
					</Card.Content>
				</Card>
				<div className="order-4 min-w-0 space-y-3">
					<MeasurementPlanEditor
						disabled={!(ready && canEdit) || isSaving}
						readOnly={!canEdit}
						websites={websites}
						plans={measurementPlans}
						onChange={(plans) => {
							setDraft({
								...(draft ?? { content, revision, teamContext }),
								measurementPlans: plans,
							});
							setNotice("");
						}}
					/>
					{dirty && !plansValid && (
						<p className="text-destructive text-xs" role="alert">
							Complete the outcome name and both event names before saving.
							Event names and namespace can contain up to 256 characters.
						</p>
					)}
					{dirty && !bindingsValid && (
						<p className="text-destructive text-xs" role="alert">
							Update or remove definitions for changed or unavailable websites
							before saving.
						</p>
					)}
				</div>
				{(report || generating) && (
					<div className="order-5 min-w-0">
						<BusinessContextResearchReport
							research={report}
							active={generating}
							label={
								currentGeneration || generating
									? "Research report"
									: "Last research"
							}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

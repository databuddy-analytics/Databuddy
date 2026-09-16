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
	BusinessContextResearchCard,
	BusinessContextSourceInput,
} from "./business-context-layout";
import { useBusinessContextDraft } from "./use-business-context-draft";
import { MeasurementPlanEditor } from "./measurement-plan-editor";
import {
	BusinessContextMarkdown,
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
	const [notice, setNotice] = useState("");
	const [settledGenerationId, setSettledGenerationId] = useState<string>();
	const [reviewVersion, setReviewVersion] = useState("proposed");
	const [review, setReview] = useState<Review | null>(null);
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
	const activeGeneration = businessContextIsGenerating(settings);
	const generating = isRequesting || activeGeneration;
	const failedGeneration =
		!generating &&
		generation?.status === "failed" &&
		generation.id !== settledGenerationId
			? generation
			: null;
	const readyGeneration =
		generation?.status === "ready" &&
		generation.id !== settledGenerationId &&
		generationWebsite &&
		generation.draft
			? generation
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
	const liveText = generation?.progress?.content ?? "";
	const displayedDraft = readyGeneration?.draft?.content ?? liveText;
	const hasGeneratedContent = generating || !!readyGeneration;

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
		updateResearch({ websiteId: selectedWebsite.id, sourceText });
		setIsRequesting(true);
		setView("draft");
		setError(undefined);
		setNotice("");
		try {
			await onGenerate(selectedWebsite.id, sourceResult.data);
		} catch (cause) {
			setError(
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

	return (
		<div className="space-y-6" ref={pageRef}>
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
			<div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="contents">
					<Card
						className="min-w-0 xl:col-start-1"
						data-testid="business-context-brief"
					>
						<BusinessContextBriefHeader>
							<Badge variant={dirty ? "warning" : "muted"}>
								{dirty ? "Unsaved changes" : profile ? "Saved" : "Not set up"}
							</Badge>
						</BusinessContextBriefHeader>
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
															{dayjs(previous.updatedAt).format(
																"MMM D, h:mm A"
															)}
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
									className="h-80 overflow-y-auto p-5 sm:p-6"
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
													value. Databuddy can also read your website to prepare
													a draft.
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
									<Tabs.Panel value="edit" className="h-80 overflow-y-auto p-5">
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
										className="h-80 overflow-y-auto p-5 sm:p-6"
										aria-label="AI draft preview"
									>
										{displayedDraft ? (
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
										A newer version was saved. Review it before saving your
										edits.
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
					<Card className="order-2 min-w-0 xl:col-start-1">
						<Card.Header>
							<Card.Title>What matters to your team</Card.Title>
							<Card.Description>
								Your priorities and corrections stay separate from website
								research and are kept when you regenerate.
							</Card.Description>
						</Card.Header>
						<Card.Content className="space-y-5">
							{teamFields.map(({ key, label, description }) => (
								<Field
									key={key}
									error={
										teamContext[key].trim().length >
										BUSINESS_CONTEXT_TEAM_FIELD_LIMIT
									}
								>
									<Field.Label>{label}</Field.Label>
									<Field.Description>{description}</Field.Description>
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
							))}
						</Card.Content>
					</Card>
					<div className="order-3 min-w-0 space-y-3 xl:col-start-1">
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
				</div>
				<aside className="order-1 min-w-0 space-y-5 xl:col-start-2 xl:row-span-3 xl:row-start-1">
					{canEdit && (
						<BusinessContextResearchCard>
							{websites.length > 1 ? (
								<DropdownMenu>
									<DropdownMenu.Trigger
										aria-label={`Source website: ${selectedWebsite?.name || selectedWebsite?.domain}`}
										render={
											<Button
												disabled={!ready || generating || isSaving}
												size="sm"
												variant="secondary"
												className="w-full justify-between"
											/>
										}
									>
										<span className="truncate">
											{selectedWebsite?.name || selectedWebsite?.domain}
										</span>
										<CaretDownIcon className="size-3 shrink-0" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content>
										<DropdownMenu.Group>
											<DropdownMenu.GroupLabel>
												Generate from website
											</DropdownMenu.GroupLabel>
											<DropdownMenu.RadioGroup
												value={selectedWebsite?.id}
												onValueChange={(websiteId) =>
													updateResearch({ websiteId, sourceText })
												}
											>
												{websites.map((site) => (
													<DropdownMenu.RadioItem key={site.id} value={site.id}>
														{site.name || site.domain}
													</DropdownMenu.RadioItem>
												))}
											</DropdownMenu.RadioGroup>
										</DropdownMenu.Group>
									</DropdownMenu.Content>
								</DropdownMenu>
							) : (
								<p className="flex h-8 min-w-0 items-center font-medium text-xs">
									<span className="truncate">
										{selectedWebsite?.domain || "No website connected"}
									</span>
								</p>
							)}
							<BusinessContextSourceInput
								value={sourceText}
								onChange={(sourceText) =>
									updateResearch({ websiteId: selectedWebsite?.id, sourceText })
								}
								readOnly={!ready || generating || isSaving || !selectedWebsite}
								error={sourceError}
							/>
							<div className="space-y-2">
								<div
									className="min-h-16 space-y-2 text-xs leading-5"
									role="status"
									aria-live="polite"
								>
									{failedGeneration && (
										<div className="flex items-start gap-2">
											<p className="min-w-0 flex-1 text-destructive">
												{failedGeneration.error ||
													"The draft could not be completed. Your saved brief is unchanged. Try again."}
											</p>
											<Button
												aria-label="Dismiss generation error"
												className="shrink-0"
												size="icon-sm"
												variant="ghost"
												disabled={isSaving}
												onClick={() =>
													change(
														() => onCancel(failedGeneration.id),
														"Generation error dismissed",
														false
													)
												}
											>
												<XMarkIcon aria-hidden className="size-4" />
											</Button>
										</div>
									)}
									{selectedWebsite ? (
										generating ? (
											<p className="text-muted-foreground">
												{generation?.progress?.stage === "writing"
													? "Writing your draft."
													: "Reading your sources."}{" "}
												Saving your edits cancels this draft.
											</p>
										) : accessPending ? (
											<p className="text-muted-foreground">
												Checking generation access…
											</p>
										) : !failedGeneration || access?.status !== "allowed" ? (
											<p
												className={
													access?.status === "allowed"
														? "text-muted-foreground"
														: "text-foreground"
												}
											>
												{access?.message ||
													"Generation access could not be checked. Your brief is still editable."}
											</p>
										) : null
									) : (
										<p className="text-muted-foreground">
											Add a website to generate a draft. You can write and save
											your brief now.
										</p>
									)}
								</div>
								{generating ? (
									<Button
										className="w-full"
										size="sm"
										variant="secondary"
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
									>
										Cancel generation
									</Button>
								) : selectedWebsite ? (
									!accessPending && access?.action === "billing" ? (
										<Button
											asChild
											className="w-full"
											size="sm"
											variant="secondary"
										>
											<Link href="/billing">Manage billing</Link>
										</Button>
									) : !accessPending && access?.status !== "allowed" ? (
										<Button
											className="w-full"
											size="sm"
											variant="secondary"
											onClick={onRefreshAccess}
										>
											Check again
										</Button>
									) : (
										<Button
											className="w-full"
											disabled={!canGenerate}
											onClick={generate}
											size="sm"
											variant="secondary"
										>
											{isRequesting ? (
												<Spinner size="sm" aria-hidden />
											) : (
												<WandSparkleIcon className="size-4" />
											)}
											{isRequesting
												? "Starting draft…"
												: content.trim() || profile
													? "Regenerate with AI"
													: "Generate with AI"}
										</Button>
									)
								) : (
									<Button
										asChild
										className="w-full"
										size="sm"
										variant="secondary"
									>
										<Link href="/websites">Add a website</Link>
									</Button>
								)}
							</div>
						</BusinessContextResearchCard>
					)}
					<section className="space-y-3 px-1" aria-label="Context checklist">
						<h2 className="font-semibold text-xs">Context at a glance</h2>
						<ul className="space-y-3 text-xs leading-5">
							{[
								[
									"Business background",
									!!content.trim(),
									"Describe what you offer and who it helps.",
								],
								[
									"Current priority",
									!!teamContext.priority.trim(),
									"Tell Databuddy which outcome matters now.",
								],
								[
									"Success definition",
									!!teamContext.successDefinition.trim(),
									"Explain what getting value means for a customer.",
								],
								[
									"Activation and return",
									measurementPlans.length > 0 && plansValid && bindingsValid,
									"Optional: connect an outcome to recorded events.",
								],
							].map(([label, complete, hint]) => (
								<li key={String(label)}>
									<div className="flex items-center justify-between gap-2">
										<span>{label}</span>
										<span
											className={
												complete ? "text-success" : "text-muted-foreground"
											}
										>
											{complete ? "Added" : "Not set"}
										</span>
									</div>
									{!complete && (
										<p className="mt-1 text-muted-foreground">{hint}</p>
									)}
								</li>
							))}
						</ul>
						{dirty && (
							<p className="text-muted-foreground text-xs">
								This preview includes your unsaved changes.
							</p>
						)}
					</section>
					<section
						className="space-y-3 border-border border-t px-1 pt-5"
						aria-label="Sources"
					>
						<h2 className="font-semibold text-xs">
							{view === "draft" ? "Draft sources" : "Brief sources"}
						</h2>
						<BusinessContextSources
							sources={
								view === "draft"
									? (readyGeneration?.draft?.sources ?? [])
									: (draftGeneration?.draft?.sources ?? profile?.sources ?? [])
							}
						/>
					</section>
				</aside>
			</div>
		</div>
	);
}

"use client";

import {
	BUSINESS_CONTEXT_LIMIT,
	BUSINESS_CONTEXT_TEAM_FIELD_LIMIT,
	type BusinessBrief,
	type BusinessContextEdit,
	type BusinessTeamContext,
	type OrganizationBusinessProfile,
	type BusinessContextSettings,
	businessContextIsGenerating,
	formatBusinessTeamContext,
} from "@databuddy/shared/organization-business-context";
import { Button, Card, Field, Textarea, dayjs } from "@databuddy/ui";
import { Accordion, Dialog, DropdownMenu } from "@databuddy/ui/client";
import { diffWordsWithSpace } from "diff";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	FileTextIcon,
	FloppyDiskIcon,
	WandSparkleIcon,
} from "@databuddy/ui/icons";
import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { useBusinessContextDraft } from "./use-business-context-draft";

const emptyTeamContext: BusinessTeamContext = {
	priority: "",
	successDefinition: "",
	exclusions: "",
};
const teamFields = [
	{
		key: "priority",
		label: "Current priority",
		placeholder: "What business outcome matters most right now?",
	},
	{
		key: "successDefinition",
		label: "How you define success",
		placeholder:
			"Which events or actions mean a customer has reached that outcome?",
	},
	{
		key: "exclusions",
		label: "Things to exclude or account for",
		placeholder:
			"Internal traffic, test accounts, seasonality, or other constraints.",
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
	onCancel: (generationId: string) => Promise<void>;
	onGenerate: (websiteId: string) => Promise<void>;
	onRestore: (restoreRevision: number, revision: number) => Promise<void>;
	onSave: (draft: BusinessContextEdit) => Promise<void>;
	settings: BusinessContextSettings;
	storageKey: string;
}

function BriefChanges({ before, after }: { before: string; after: string }) {
	const changes = diffWordsWithSpace(before, after, { timeout: 50 });
	if (!changes) {
		return (
			<div className="grid gap-5 sm:grid-cols-2">
				<div>
					<p className="mb-2 font-medium">Current text</p>
					<p className="whitespace-pre-wrap break-words">{before || "Empty"}</p>
				</div>
				<div>
					<p className="mb-2 font-medium">Selected version</p>
					<p className="whitespace-pre-wrap break-words">{after || "Empty"}</p>
				</div>
			</div>
		);
	}
	let offset = 0;
	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				Additions are underlined. Removed text is struck through.
			</p>
			<p className="whitespace-pre-wrap break-words text-xs leading-6">
				{changes.map((change) => {
					const key = `${offset}:${change.added ? "add" : change.removed ? "remove" : "keep"}`;
					offset += change.value.length;
					if (change.added) {
						return (
							<ins className="bg-success/10 text-success" key={key}>
								{change.value}
							</ins>
						);
					}
					if (change.removed) {
						return (
							<del className="bg-destructive/10 text-destructive" key={key}>
								{change.value}
							</del>
						);
					}
					return <span key={key}>{change.value}</span>;
				})}
			</p>
		</div>
	);
}

function Sources({ sources }: { sources: BusinessBrief["sources"] }) {
	const links = sources.filter(
		({ url }) => url.startsWith("https://") || url.startsWith("http://")
	);
	if (!links.length) {
		return null;
	}
	return (
		<Card>
			<Card.Header>
				<Card.Title>Sources</Card.Title>
				<Card.Description>Pages used to generate this brief</Card.Description>
			</Card.Header>
			<Card.Content className="divide-y p-0">
				{links.map(({ url, title }) => {
					const page = new URL(url);
					return (
						<a
							aria-label={title || page.hostname}
							className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-interactive-hover"
							href={url}
							key={url}
							rel="noopener noreferrer"
							target="_blank"
							title={url}
						>
							<FileTextIcon className="size-4 text-muted-foreground" />
							<div className="min-w-0">
								<p className="truncate font-medium text-foreground text-xs">
									{title || page.hostname}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{page.hostname}
									{page.pathname === "/" ? "" : page.pathname}
								</p>
							</div>
							<ArrowSquareOutIcon className="size-3.5 text-muted-foreground/40 group-hover:text-foreground" />
						</a>
					);
				})}
			</Card.Content>
		</Card>
	);
}

export function BusinessContextEditor({
	settings,
	onGenerate,
	onSave,
	onCancel,
	onRestore,
	storageKey,
}: BusinessContextEditorProps) {
	const { profile, generation, canEdit, websites } = settings;
	const {
		draft,
		updateDraft: setDraft,
		clearDraft: clearSubmittedDraft,
		ready,
		recoverable,
	} = useBusinessContextDraft(storageKey, canEdit);
	const [websiteId, setWebsiteId] = useState<string>();
	const [isSaving, setIsSaving] = useState(false);
	const [isRequesting, setIsRequesting] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState("");
	const [settledGenerationId, setSettledGenerationId] = useState<string>();
	const [review, setReview] = useState<Review | null>(null);
	const editorRef = useRef<HTMLTextAreaElement>(null);
	const reviewTitleRef = useRef<HTMLHeadingElement>(null);
	const savingRef = useRef(false);
	const revision = profile?.revision ?? 0;
	const content = draft?.content ?? profile?.content ?? "";
	const teamContext =
		draft?.teamContext ?? profile?.teamContext ?? emptyTeamContext;
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
			formatBusinessTeamContext(teamContext) !==
				formatBusinessTeamContext(profile?.teamContext));
	const conflict = dirty && draft.revision !== revision;
	const activeGeneration = businessContextIsGenerating(settings);
	const generating = isRequesting || activeGeneration;
	const readyGeneration =
		generation?.status === "ready" &&
		generation.id !== settledGenerationId &&
		generationWebsite &&
		generation.draft
			? generation
			: null;
	const pendingDraft =
		readyGeneration && readyGeneration.id !== draft?.generationId
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
	const saveDisabled =
		!(ready && canEdit && dirty) ||
		conflict ||
		tooLong ||
		teamTooLong ||
		isSaving ||
		review !== null;
	const reviewedProfile = review?.kind === "history" ? review.profile : profile;
	const reviewText =
		review?.kind === "generation"
			? (pendingDraft?.draft?.content ?? "")
			: (reviewedProfile?.content ?? "");
	const reviewTeam =
		review?.kind === "generation" ? teamContext : reviewedProfile?.teamContext;

	useEffect(() => {
		if (
			!(ready && canEdit) ||
			draft ||
			isSaving ||
			!readyGeneration?.draft ||
			readyGeneration.baseRevision !== revision
		) {
			return;
		}
		// A result may arrive between keystrokes. Only an untouched editor can adopt it automatically.
		const generatedDraft = readyGeneration.draft;
		setDraft({
			content: generatedDraft.content,
			revision,
			generationId: readyGeneration.id,
			teamContext: profile?.teamContext,
		});
	}, [
		ready,
		canEdit,
		draft,
		isSaving,
		readyGeneration,
		revision,
		profile?.teamContext,
		setDraft,
	]);

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
					...(draftGeneration ? { generationId: draftGeneration.id } : {}),
				}),
			"Changes saved"
		);
	}

	async function generate() {
		if (!(canEdit && selectedWebsite) || generating || isSaving) {
			return;
		}
		setIsRequesting(true);
		setError(undefined);
		setNotice("");
		try {
			await onGenerate(selectedWebsite.id);
		} catch (cause) {
			setError(
				getUserFacingErrorMessage(
					cause,
					"Couldn't start a draft. Please try again."
				)
			);
		} finally {
			setIsRequesting(false);
		}
	}

	return (
		<div className="space-y-5">
			{canEdit && (dirty || draft) && (
				<TopBar.Actions>
					<Button
						aria-label="Discard changes"
						disabled={isSaving}
						onClick={discard}
						size="sm"
						variant="ghost"
					>
						<span>
							Discard<span className="hidden sm:inline"> changes</span>
						</span>
					</Button>
					{dirty && (
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
							<FloppyDiskIcon className="hidden size-4 shrink-0 sm:block" />
							<span>
								Save<span className="hidden sm:inline"> changes</span>
							</span>
						</Button>
					)}
				</TopBar.Actions>
			)}
			<Card>
				<Card.Header>
					<Card.Title>Business context</Card.Title>
					<Card.Description>
						What you do and who you serve. Applies to every website in this
						organization.
					</Card.Description>
				</Card.Header>
				<Card.Content className="space-y-5">
					{canEdit && (
						<div className="flex flex-wrap items-center justify-between gap-3">
							{websites.length > 1 ? (
								<DropdownMenu>
									<DropdownMenu.Trigger
										render={
											<Button
												disabled={generating || isSaving}
												size="sm"
												variant="secondary"
											/>
										}
										aria-label={`Source website: ${selectedWebsite?.name || selectedWebsite?.domain}`}
									>
										<span className="max-w-48 truncate">
											{selectedWebsite?.name || selectedWebsite?.domain}
										</span>
										<CaretDownIcon className="size-3 shrink-0" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start">
										<DropdownMenu.Group>
											<DropdownMenu.GroupLabel>
												Generate from website
											</DropdownMenu.GroupLabel>
											<DropdownMenu.RadioGroup
												onValueChange={setWebsiteId}
												value={selectedWebsite?.id}
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
								<p className="text-muted-foreground text-xs">
									{selectedWebsite
										? `From ${selectedWebsite.domain}`
										: "Add a website to generate a brief, or write your own below."}
								</p>
							)}
							{selectedWebsite && (
								<Button
									disabled={generating || isSaving}
									onClick={generate}
									size="sm"
									variant="secondary"
								>
									<WandSparkleIcon className="size-4 shrink-0" />
									{generating
										? "Generating draft…"
										: content.trim() || profile
											? "Regenerate with AI"
											: "Generate with AI"}
								</Button>
							)}
							{activeGeneration && generation && (
								<Button
									disabled={isSaving}
									onClick={() =>
										change(
											() => onCancel(generation.id),
											"Generation cancelled",
											false
										)
									}
									size="sm"
									variant="ghost"
								>
									Cancel
								</Button>
							)}
						</div>
					)}
					<div
						aria-live="polite"
						className="space-y-2 text-muted-foreground text-xs"
					>
						{generating && (
							<p>
								{canEdit
									? generation?.status === "queued"
										? "Waiting to start. You can keep writing."
										: "Reading your website and preparing a draft. You can keep writing. Saving ends this generation."
									: "An updated brief is being prepared."}
							</p>
						)}
						{pendingDraft && canEdit && (
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p>An AI draft is ready. Your current text has been kept.</p>
								<Button
									disabled={isSaving}
									onClick={() => setReview({ kind: "generation" })}
									size="sm"
									variant="secondary"
								>
									Review AI draft
								</Button>
							</div>
						)}
						{generation?.status === "failed" && canEdit && (
							<p role="alert">
								{generation.error ||
									"AI couldn't finish this draft. Try generating again, or keep editing."}
							</p>
						)}
						{notice && <p>{notice}</p>}
					</div>
					<Field error={tooLong}>
						<Field.Label>Business brief</Field.Label>
						<Field.Description>
							{canEdit
								? "Used by Databunny to interpret your analytics. Changes apply when saved."
								: "Used by Databunny to interpret your analytics. Organization admins can update it."}
						</Field.Description>
						<Textarea
							className="leading-6"
							minRows={12}
							maxRows={12}
							onChange={(event) => {
								setDraft({
									...(draft ?? { revision, teamContext }),
									content: event.target.value,
								});
								setNotice("");
							}}
							placeholder={
								canEdit
									? "Describe your product, customers, business model, and priorities. Include what your key events mean and anything the agent should account for."
									: "No business brief has been saved yet."
							}
							readOnly={!(ready && canEdit) || isSaving}
							ref={editorRef}
							value={content}
						/>
						{tooLong && (
							<Field.Error>
								Keep the brief under {BUSINESS_CONTEXT_LIMIT.toLocaleString()}{" "}
								characters ({content.trim().length.toLocaleString()} used).
							</Field.Error>
						)}
					</Field>
					<Accordion>
						<Accordion.Trigger>What matters to your team</Accordion.Trigger>
						<Accordion.Content className="space-y-4 pt-4">
							<p className="text-muted-foreground text-xs">
								Optional context your website cannot explain. Kept when AI
								regenerates the brief.
							</p>
							{teamFields.map(({ key, label, placeholder }) => (
								<Field
									key={key}
									error={
										teamContext[key].trim().length >
										BUSINESS_CONTEXT_TEAM_FIELD_LIMIT
									}
								>
									<Field.Label>{label}</Field.Label>
									<Textarea
										value={teamContext[key]}
										placeholder={placeholder}
										minRows={2}
										maxRows={6}
										readOnly={!(ready && canEdit) || isSaving}
										onChange={(event) => {
											setDraft({
												...(draft ?? { content, revision }),
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
						</Accordion.Content>
					</Accordion>
					{conflict && canEdit && (
						<div
							className="flex flex-wrap items-center justify-between gap-2"
							role="alert"
						>
							<p className="text-muted-foreground text-xs">
								A newer brief was saved. Review it before saving your edits.
							</p>
							<Button
								onClick={() => setReview({ kind: "conflict" })}
								size="sm"
								variant="secondary"
							>
								Review update
							</Button>
						</div>
					)}
					{error && !conflict && (
						<p className="text-destructive text-xs" role="alert">
							{error}
						</p>
					)}
				</Card.Content>
				<Card.Footer className="justify-between">
					<p className="text-muted-foreground text-xs">
						{draftGeneration ? (
							"AI draft · Not saved"
						) : dirty ? (
							recoverable ? (
								"Unsaved changes · Kept in this tab"
							) : (
								"Unsaved changes · Save before closing this tab"
							)
						) : profile ? (
							<time
								dateTime={profile.updatedAt}
								title={dayjs(profile.updatedAt).format(
									"MMM D, YYYY [at] h:mm A"
								)}
							>
								Updated {dayjs(profile.updatedAt).fromNow()}
							</time>
						) : (
							"No saved brief yet"
						)}
					</p>
					{Boolean(settings.history?.length) && (
						<DropdownMenu>
							<DropdownMenu.Trigger
								render={<Button size="sm" variant="ghost" />}
							>
								History
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
				</Card.Footer>
			</Card>
			<Sources
				sources={draftGeneration?.draft?.sources ?? profile?.sources ?? []}
			/>
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setReview(null);
					}
				}}
				open={review !== null}
			>
				<Dialog.Content className="max-w-2xl" initialFocus={reviewTitleRef}>
					<Dialog.Header>
						<Dialog.Title
							render={(props) => (
								<h2 {...props} ref={reviewTitleRef} tabIndex={-1}>
									{props.children}
								</h2>
							)}
						>
							{review?.kind === "generation"
								? "Review AI draft"
								: review?.kind === "history"
									? `Review version ${review.profile.revision}`
									: "Review the latest saved brief"}
						</Dialog.Title>
						<Dialog.Description>
							{review?.kind === "generation"
								? "Using this draft replaces your local text. You can edit it before saving."
								: review?.kind === "history"
									? "Restoring replaces the saved brief and your current edits. Your current saved version stays in history."
									: "Your edits are still in the editor. Choose which version to keep working on."}
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body className="max-h-[60vh] space-y-4 overflow-y-auto">
						<BriefChanges
							before={[content, formatBusinessTeamContext(teamContext)]
								.filter(Boolean)
								.join("\n\n")}
							after={[reviewText, formatBusinessTeamContext(reviewTeam)]
								.filter(Boolean)
								.join("\n\n")}
						/>
						{review?.kind === "generation" &&
							pendingDraft?.baseRevision !== revision && (
								<p className="text-muted-foreground text-xs">
									This draft was generated before the latest saved update. Check
									that it includes what matters.
								</p>
							)}
						<Sources
							sources={
								(review?.kind === "generation"
									? pendingDraft?.draft?.sources
									: reviewedProfile?.sources) ?? []
							}
						/>
					</Dialog.Body>
					<Dialog.Footer>
						{error && (
							<p className="text-destructive text-xs" role="alert">
								{error}
							</p>
						)}
						{review?.kind === "history" ? (
							<>
								<Button
									size="sm"
									variant="ghost"
									disabled={isSaving}
									onClick={() => setReview(null)}
								>
									Keep current version
								</Button>
								<Button
									size="sm"
									disabled={!canEdit || isSaving}
									onClick={() =>
										change(
											() =>
												onRestore(review.profile.revision, review.baseRevision),
											"Version restored"
										)
									}
								>
									Restore this version
								</Button>
							</>
						) : review?.kind === "generation" ? (
							<>
								<Button
									disabled={isSaving}
									onClick={() =>
										pendingDraft &&
										change(() => onCancel(pendingDraft.id), "", false)
									}
									size="sm"
									variant="ghost"
								>
									Keep current text
								</Button>
								<Button
									disabled={!(canEdit && pendingDraft?.draft) || isSaving}
									onClick={() => {
										if (!pendingDraft?.draft) {
											return;
										}
										setDraft({
											content: pendingDraft.draft.content,
											revision,
											generationId: pendingDraft.id,
											teamContext,
										});
										setReview(null);
										editorRef.current?.focus();
									}}
									size="sm"
								>
									Use AI draft
								</Button>
							</>
						) : (
							<>
								<Button
									onClick={discard}
									disabled={isSaving}
									size="sm"
									variant="ghost"
								>
									Use saved version
								</Button>
								<Button
									disabled={!canEdit || isSaving}
									onClick={() => {
										setDraft(draft ? { ...draft, revision } : null);
										setError(undefined);
										setReview(null);
									}}
									size="sm"
								>
									Keep my edits
								</Button>
							</>
						)}
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog>
		</div>
	);
}

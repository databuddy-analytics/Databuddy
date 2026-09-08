"use client";

import {
	BUSINESS_CONTEXT_LIMIT,
	type BusinessBrief,
	type BusinessContextSettings,
	businessContextIsGenerating,
} from "@databuddy/shared/organization-business-context";
import { Button, Field, Textarea, dayjs } from "@databuddy/ui";
import { Dialog, DropdownMenu } from "@databuddy/ui/client";
import { CaretDownIcon, WandSparkleIcon } from "@databuddy/ui/icons";
import { useEffect, useRef, useState } from "react";

interface EditableBrief {
	content: string;
	generationId?: string;
	revision: number;
}

interface BusinessContextEditorProps {
	onGenerate: (websiteId: string) => Promise<void>;
	onSave: (draft: {
		content: string;
		revision: number;
		generationId?: string;
	}) => Promise<void>;
	settings: BusinessContextSettings;
}

function Sources({ sources }: { sources: BusinessBrief["sources"] }) {
	const links = sources.filter(
		({ url }) => url.startsWith("https://") || url.startsWith("http://")
	);
	if (!links.length) {
		return null;
	}
	return (
		<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
			<span className="text-muted-foreground">Sources</span>
			{links.map(({ url, title }) => (
				<a
					className="max-w-full truncate text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
					href={url}
					key={url}
					rel="noopener noreferrer"
					target="_blank"
					title={url}
				>
					{title || new URL(url).hostname}
				</a>
			))}
		</div>
	);
}

export function BusinessContextEditor({
	settings,
	onGenerate,
	onSave,
}: BusinessContextEditorProps) {
	const { profile, generation, canEdit, websites } = settings;
	const [draft, setDraft] = useState<EditableBrief | null>(null);
	const [dismissedGenerationId, setDismissedGenerationId] = useState<string>();
	const [websiteId, setWebsiteId] = useState<string>();
	const [isSaving, setIsSaving] = useState(false);
	const [isRequesting, setIsRequesting] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState("");
	const [review, setReview] = useState<"generation" | "conflict" | null>(null);
	const editorRef = useRef<HTMLTextAreaElement>(null);
	const revision = profile?.revision ?? 0;
	const content = draft?.content ?? profile?.content ?? "";
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
		(content.trim() !== (profile?.content ?? "") || Boolean(draftGeneration));
	const conflict = dirty && draft.revision !== revision;
	const activeGeneration = businessContextIsGenerating(settings);
	const generating = isRequesting || activeGeneration;
	const readyGeneration =
		generation?.status === "ready" &&
		generationWebsite &&
		generation.draft &&
		generation.id !== dismissedGenerationId
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
	const saveDisabled =
		!(canEdit && dirty) || conflict || tooLong || isSaving || review !== null;

	useEffect(() => {
		if (!canEdit) {
			setDraft(null);
			setReview(null);
			return;
		}
		if (
			isSaving ||
			!readyGeneration?.draft ||
			readyGeneration.baseRevision !== revision
		) {
			return;
		}
		// A result may arrive between keystrokes. Only an untouched editor can adopt it automatically.
		const generatedDraft = readyGeneration.draft;
		setDraft(
			(current) =>
				current ?? {
					content: generatedDraft.content,
					revision,
					generationId: readyGeneration.id,
				}
		);
	}, [canEdit, isSaving, readyGeneration, revision]);

	function discard() {
		setDismissedGenerationId(generation?.id);
		setDraft(null);
		setError(undefined);
		setNotice("");
		setReview(null);
	}

	async function save() {
		if (saveDisabled || !draft) {
			return;
		}
		setIsSaving(true);
		setError(undefined);
		setNotice("");
		try {
			await onSave({
				content: content.trim(),
				revision: draft.revision,
				...(draft.generationId ? { generationId: draft.generationId } : {}),
			});
			setDismissedGenerationId(generation?.id);
			setDraft(null);
			setNotice("Changes saved");
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Couldn't save the brief. Your edits are still here."
			);
		} finally {
			setIsSaving(false);
		}
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
				cause instanceof Error
					? cause.message
					: "Couldn't start a draft. Please try again."
			);
		} finally {
			setIsRequesting(false);
		}
	}

	return (
		<div className="mx-auto max-w-3xl space-y-5 p-5">
			<div className="space-y-1.5">
				<h2 className="font-semibold text-foreground text-sm">
					Your business, in your words
				</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Give your agent the context behind your numbers: what you sell, who
					you serve, and what success looks like.
				</p>
			</div>
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
							variant={dirty ? "secondary" : "primary"}
						>
							<WandSparkleIcon className="size-4 shrink-0" />
							{generating
								? "Generating draft…"
								: content.trim() || profile
									? "Regenerate with AI"
									: "Generate with AI"}
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
							? "Reading your website and preparing a draft. You can keep writing."
							: "An updated brief is being prepared."}
					</p>
				)}
				{pendingDraft && canEdit && (
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p>An AI draft is ready. Your current text has been kept.</p>
						<Button
							disabled={isSaving}
							onClick={() => setReview("generation")}
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
						? "Edit anything. Your saved brief stays in use until you save changes."
						: "This is the context your agent uses. Organization admins can update it."}
				</Field.Description>
				<Textarea
					className="mt-2 px-4 py-4 text-sm leading-7"
					minRows={14}
					maxRows={32}
					onChange={(event) => {
						setDraft({
							...(draft ?? { revision }),
							content: event.target.value,
						});
						setNotice("");
					}}
					placeholder={
						canEdit
							? "What does your business do? Who are your customers? How do you make money?\n\nDescribe the customer journey, your priorities, and anything the agent should know when interpreting your analytics."
							: "No business brief has been saved yet."
					}
					readOnly={!canEdit || isSaving}
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
			{conflict && canEdit && (
				<div
					className="flex flex-wrap items-center justify-between gap-2"
					role="alert"
				>
					<p className="text-muted-foreground text-xs">
						A newer brief was saved. Review it before saving your edits.
					</p>
					<Button
						onClick={() => setReview("conflict")}
						size="sm"
						variant="secondary"
					>
						Review update
					</Button>
				</div>
			)}
			{error && (
				<p className="text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
				<p className="text-muted-foreground text-xs">
					{draftGeneration ? (
						"AI draft · Not saved"
					) : dirty ? (
						"Unsaved changes"
					) : profile ? (
						<time
							dateTime={profile.updatedAt}
							title={dayjs(profile.updatedAt).format("MMM D, YYYY [at] h:mm A")}
						>
							Updated {dayjs(profile.updatedAt).fromNow()}
						</time>
					) : (
						"No saved brief yet"
					)}
				</p>
				{canEdit && (dirty || draft) && (
					<div className="flex flex-wrap items-center gap-2">
						<Button
							disabled={isSaving}
							onClick={discard}
							size="sm"
							variant="ghost"
						>
							Discard changes
						</Button>
						{dirty && (
							<Button
								disabled={saveDisabled}
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
								{isSaving ? "Saving…" : "Save changes"}
							</Button>
						)}
					</div>
				)}
			</div>
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
				<Dialog.Content className="max-w-2xl">
					<Dialog.Header>
						<Dialog.Title>
							{review === "generation"
								? "Review AI draft"
								: "Review the latest saved brief"}
						</Dialog.Title>
						<Dialog.Description>
							{review === "generation"
								? "Using this draft replaces your local text. You can edit it before saving."
								: "Your edits are still in the editor. Choose which version to keep working on."}
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body className="max-h-[60vh] space-y-4 overflow-y-auto">
						<p className="whitespace-pre-wrap break-words text-sm leading-7">
							{review === "generation"
								? pendingDraft?.draft?.content
								: profile?.content || "The saved brief is empty."}
						</p>
						{review === "generation" &&
							pendingDraft?.baseRevision !== revision && (
								<p className="text-muted-foreground text-xs">
									This draft was generated before the latest saved update. Check
									that it includes what matters.
								</p>
							)}
						<Sources
							sources={
								(review === "generation"
									? pendingDraft?.draft?.sources
									: profile?.sources) ?? []
							}
						/>
					</Dialog.Body>
					<Dialog.Footer>
						{review === "generation" ? (
							<>
								<Button
									onClick={() => {
										setDismissedGenerationId(generation?.id);
										setReview(null);
									}}
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
								<Button onClick={discard} size="sm" variant="ghost">
									Use saved version
								</Button>
								<Button
									disabled={!canEdit || isSaving}
									onClick={() => {
										setDraft((current) =>
											current ? { ...current, revision } : null
										);
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

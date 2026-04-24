import { useMemo, useState } from "preact/hooks";
import type {
	DatabuddyDevtoolsEvent,
	DatabuddyFlagCatalogEntry,
	DatabuddyFlagCatalogVariant,
	DatabuddyFlagEntry,
	DatabuddyFlagsSnapshot,
	DatabuddyIdentitySnapshot,
	DatabuddyQueueSnapshot,
	DatabuddyTrackerSnapshot,
	DiagnosticItem,
	FlagCatalogState,
} from "../../core";
import {
	CheckIcon,
	ChevronIcon,
	CopyIcon,
	FailIcon,
	FlagIcon,
	InboxIcon,
	InfoIcon,
	PlayIcon,
	PlusIcon,
	RefreshIcon,
	TrashIcon,
	WarnIcon,
} from "../icons";
import {
	type CreateFlagInput,
	DEFAULT_ADMIN_API_URL,
	type FlagMutationResult,
	type RuntimeTone,
	type UpdateFlagInput,
} from "../store";

interface PanelProps {
	diagnostics: DiagnosticItem[];
	events: DatabuddyDevtoolsEvent[];
	flags: DatabuddyFlagsSnapshot;
	identity: DatabuddyIdentitySnapshot;
	queue: DatabuddyQueueSnapshot;
	snapshot: DatabuddyTrackerSnapshot;
	runtime: { tone: RuntimeTone; label: string };
	adminApiUrl: string | null;
	adminKey: string | null;
	catalog: FlagCatalogState;
	onTrackTest: () => void;
	onFlush: () => void;
	onResetSession: () => void;
	onRefreshFlags: () => void;
	onClearEvents: () => void;
	onTrackCustom: (name: string, properties: Record<string, unknown>) => void;
	onSetGlobalProperty: (key: string, value: unknown) => void;
	onRemoveGlobalProperty: (key: string) => void;
	onClearGlobalProperties: () => void;
	onSetFlagOverride: (
		key: string,
		override: {
			enabled: boolean;
			value: boolean | string | number;
			variant?: string;
		}
	) => void;
	onClearFlagOverride: (key: string) => void;
	onSetAdminKey: (key: string | null) => void;
	onSetAdminApiUrl: (url: string | null) => void;
	onFetchCatalog: () => void;
	onCreateFlag: (input: CreateFlagInput) => Promise<FlagMutationResult>;
	onUpdateFlag: (
		id: string,
		input: UpdateFlagInput
	) => Promise<FlagMutationResult>;
	onDeleteFlag: (id: string) => Promise<FlagMutationResult>;
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

const TRAILING_SLASH_RE = /\/+$/;

const EVENT_PREVIEW_COUNT = 5;

const STATUS_ICONS = {
	ok: CheckIcon,
	warn: WarnIcon,
	fail: FailIcon,
	info: InfoIcon,
} as const;

const QUEUE_LABELS = [
	{ key: "batch", label: "Batch" },
	{ key: "track", label: "Track" },
	{ key: "vitals", label: "Vitals" },
	{ key: "errors", label: "Errors" },
] as const;

function formatAge(ms: number | null): string {
	if (ms === null || ms < 0) {
		return "—";
	}
	const sec = Math.floor(ms / 1000);
	if (sec < 60) {
		return `${sec}s`;
	}
	const min = Math.floor(sec / 60);
	if (min < 60) {
		return `${min}m`;
	}
	const hr = Math.floor(min / 60);
	return `${hr}h ${min % 60}m`;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (typeof value === "string") {
		return value || '""';
	}
	if (typeof value === "boolean" || typeof value === "number") {
		return String(value);
	}
	if (typeof value === "function") {
		return "ƒ()";
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function parseInputValue(raw: string): unknown {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return "";
	}
	if (trimmed === "true") {
		return true;
	}
	if (trimmed === "false") {
		return false;
	}
	if (trimmed === "null") {
		return null;
	}
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		const num = Number(trimmed);
		if (!Number.isNaN(num)) {
			return num;
		}
	}
	if (
		(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
		(trimmed.startsWith("[") && trimmed.endsWith("]"))
	) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return raw;
		}
	}
	return raw;
}

function copy(value: string | null) {
	if (!(value && typeof navigator !== "undefined" && navigator.clipboard)) {
		return;
	}
	navigator.clipboard.writeText(value).catch(() => {
		// non-fatal
	});
}

function StatusStrip({
	runtime,
	events,
	diagnostics,
}: {
	runtime: { tone: RuntimeTone; label: string };
	events: DatabuddyDevtoolsEvent[];
	diagnostics: DiagnosticItem[];
}) {
	const warn = diagnostics.filter(
		(d) => d.status === "warn" || d.status === "fail"
	).length;

	return (
		<div className="panel-status">
			<span className={`dot dot--${runtime.tone}`} />
			<span className="panel-status-label">{runtime.label}</span>
			<span className="panel-status-sep">·</span>
			<span className="panel-status-meta">
				{events.length} event{events.length === 1 ? "" : "s"}
			</span>
			{warn > 0 ? (
				<span className="panel-status-warn">
					<WarnIcon /> {warn}
				</span>
			) : null}
		</div>
	);
}

function IdentityStrip({
	identity,
	onResetSession,
}: {
	identity: DatabuddyIdentitySnapshot;
	onResetSession: () => void;
}) {
	return (
		<div className="panel-identity">
			<div className="panel-identity-row">
				<span className="panel-identity-label">Session</span>
				<span
					className={`panel-identity-value mono ${identity.sessionId ? "" : "id-value--muted"}`}
				>
					{identity.sessionId ?? "not set"}
				</span>
				{identity.sessionId ? (
					<button
						aria-label="Copy session ID"
						className="icon-btn"
						onClick={() => copy(identity.sessionId)}
						type="button"
					>
						<CopyIcon />
					</button>
				) : null}
				<span className="panel-identity-age">
					{formatAge(identity.sessionAgeMs)}
				</span>
				<button
					className="btn btn--ghost btn--danger"
					onClick={onResetSession}
					type="button"
				>
					Reset
				</button>
			</div>
			<div className="panel-identity-row">
				<span className="panel-identity-label">Anon</span>
				<span
					className={`panel-identity-value mono ${identity.anonymousId ? "" : "id-value--muted"}`}
				>
					{identity.anonymousId ?? "not set"}
				</span>
				{identity.anonymousId ? (
					<button
						aria-label="Copy anonymous ID"
						className="icon-btn"
						onClick={() => copy(identity.anonymousId)}
						type="button"
					>
						<CopyIcon />
					</button>
				) : null}
			</div>
		</div>
	);
}

function FlagToggle({
	flag,
	onSetOverride,
	onClearOverride,
}: {
	flag: DatabuddyFlagEntry;
	onSetOverride: PanelProps["onSetFlagOverride"];
	onClearOverride: PanelProps["onClearFlagOverride"];
}) {
	const isOverride = flag.source === "override";
	const next = !flag.enabled;

	const handleClick = () => {
		if (isOverride) {
			onClearOverride(flag.key);
			return;
		}
		onSetOverride(flag.key, { enabled: next, value: next });
	};

	return (
		<button
			aria-label={`Toggle ${flag.key}`}
			aria-pressed={flag.enabled}
			className="switch"
			data-checked={flag.enabled ? "true" : "false"}
			data-override={isOverride ? "true" : undefined}
			onClick={handleClick}
			title={isOverride ? "Click to clear override" : "Click to override"}
			type="button"
		>
			<span className="switch-knob" />
		</button>
	);
}

function FlagAdvanced({
	flag,
	onSetOverride,
	onClearOverride,
}: {
	flag: DatabuddyFlagEntry;
	onSetOverride: PanelProps["onSetFlagOverride"];
	onClearOverride: PanelProps["onClearFlagOverride"];
}) {
	const initialValue =
		typeof flag.value === "string" ||
		typeof flag.value === "number" ||
		typeof flag.value === "boolean"
			? String(flag.value)
			: "";
	const [valueText, setValueText] = useState(initialValue);
	const [variantText, setVariantText] = useState(flag.variant ?? "");

	const handleApply = () => {
		const parsed = parseInputValue(valueText);
		const value: boolean | string | number =
			typeof parsed === "boolean" ||
			typeof parsed === "number" ||
			typeof parsed === "string"
				? parsed
				: flag.enabled;
		onSetOverride(flag.key, {
			enabled: typeof value === "boolean" ? value : flag.enabled,
			value,
			variant: variantText.trim() || undefined,
		});
	};

	return (
		<div className="flag-advanced">
			<div className="flag-advanced-field">
				<span className="field-label">Value</span>
				<input
					className="input"
					onChange={(e) => setValueText(e.currentTarget.value)}
					placeholder='true · 42 · "s"'
					type="text"
					value={valueText}
				/>
			</div>
			<div className="flag-advanced-field">
				<span className="field-label">Variant</span>
				<input
					className="input"
					onChange={(e) => setVariantText(e.currentTarget.value)}
					placeholder="optional"
					type="text"
					value={variantText}
				/>
			</div>
			<div className="flag-advanced-actions">
				<button
					className="btn btn--primary"
					onClick={handleApply}
					type="button"
				>
					Apply
				</button>
				{flag.source === "override" ? (
					<button
						className="btn btn--ghost btn--danger"
						onClick={() => onClearOverride(flag.key)}
						type="button"
					>
						Clear
					</button>
				) : null}
			</div>
		</div>
	);
}

function FlagRow({
	flag,
	catalogEntry,
	canManage,
	onSetOverride,
	onClearOverride,
	onCreateFlag,
	onUpdateFlag,
	onDeleteFlag,
}: {
	flag: DatabuddyFlagEntry;
	catalogEntry: DatabuddyFlagCatalogEntry | null;
	canManage: boolean;
	onSetOverride: PanelProps["onSetFlagOverride"];
	onClearOverride: PanelProps["onClearFlagOverride"];
	onCreateFlag: PanelProps["onCreateFlag"];
	onUpdateFlag: PanelProps["onUpdateFlag"];
	onDeleteFlag: PanelProps["onDeleteFlag"];
}) {
	const [open, setOpen] = useState(false);
	const [pendingCreate, setPendingCreate] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const isOverride = flag.source === "override";
	const isGhost = catalogEntry === null;

	const handleCreate = async () => {
		setCreateError(null);
		setPendingCreate(true);
		const result = await onCreateFlag({
			key: flag.key,
			type: "boolean",
			defaultValue: typeof flag.value === "boolean" ? flag.value : flag.enabled,
		});
		setPendingCreate(false);
		if (!result.ok) {
			setCreateError(result.error ?? "Failed to create flag.");
		}
	};

	return (
		<div
			className="flag-lite"
			data-ghost={isGhost ? "true" : undefined}
			data-override={isOverride ? "true" : undefined}
		>
			<FlagToggle
				flag={flag}
				onClearOverride={onClearOverride}
				onSetOverride={onSetOverride}
			/>
			<span className="flag-key">{flag.key}</span>
			<span className="flag-badges">
				{typeof flag.value !== "boolean" ? (
					<span className="flag-chip flag-chip--on">{formatValue(flag.value)}</span>
				) : null}
				{flag.variant ? (
					<span className="flag-chip flag-chip--variant">{flag.variant}</span>
				) : null}
				{isOverride ? (
					<span className="flag-source-tag flag-source-tag--override">
						override
					</span>
				) : null}
				{isGhost ? (
					<span className="flag-source-tag flag-source-tag--ghost">
						not in catalog
					</span>
				) : null}
			</span>
			<div className="flag-lite-actions">
				{isGhost && canManage ? (
					<button
						aria-label={`Add ${flag.key} to catalog`}
						className="btn btn--ghost btn--compact"
						disabled={pendingCreate}
						onClick={handleCreate}
						title="Add to catalog"
						type="button"
					>
						<PlusIcon /> {pendingCreate ? "Adding…" : "Add"}
					</button>
				) : null}
				<button
					aria-expanded={open}
					aria-label="Edit flag"
					className="icon-btn"
					onClick={() => setOpen((p) => !p)}
					type="button"
				>
					<ChevronIcon data-open={open ? "true" : "false"} />
				</button>
			</div>
			{createError ? (
				<div className="flag-lite-error hint hint--error">{createError}</div>
			) : null}
			{open ? (
				<>
					<FlagAdvanced
						flag={flag}
						onClearOverride={onClearOverride}
						onSetOverride={onSetOverride}
					/>
					{catalogEntry ? (
						<FlagManageControls
							entry={catalogEntry}
							onDelete={onDeleteFlag}
							onUpdate={onUpdateFlag}
						/>
					) : null}
				</>
			) : null}
		</div>
	);
}

function FlagManageControls({
	entry,
	onUpdate,
	onDelete,
}: {
	entry: DatabuddyFlagCatalogEntry;
	onUpdate: PanelProps["onUpdateFlag"];
	onDelete: PanelProps["onDeleteFlag"];
}) {
	const [pending, setPending] = useState<"save" | "delete" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [draftDefault, setDraftDefault] = useState(entry.defaultValue);
	const [draftDesc, setDraftDesc] = useState(entry.description ?? "");
	const [draftVariants, setDraftVariants] = useState<
		DatabuddyFlagCatalogVariant[]
	>(entry.variants ?? []);

	const dirty =
		draftDefault !== entry.defaultValue ||
		(draftDesc || "") !== (entry.description ?? "") ||
		JSON.stringify(draftVariants) !== JSON.stringify(entry.variants ?? []);

	const save = async () => {
		setError(null);
		setPending("save");
		const result = await onUpdate(entry.id, {
			defaultValue: draftDefault,
			description: draftDesc === "" ? null : draftDesc,
			variants: draftVariants,
		});
		setPending(null);
		if (!result.ok) {
			setError(result.error ?? "Failed to save.");
		}
	};

	const remove = async () => {
		setError(null);
		setPending("delete");
		const result = await onDelete(entry.id);
		setPending(null);
		if (!result.ok) {
			setError(result.error ?? "Failed to delete.");
		}
	};

	const addVariant = () => {
		setDraftVariants((prev) => [
			...prev,
			{ key: `v${prev.length + 1}`, type: "string", value: "" },
		]);
	};

	const removeVariant = (idx: number) => {
		setDraftVariants((prev) => prev.filter((_, i) => i !== idx));
	};

	const patchVariant = (
		idx: number,
		patch: Partial<DatabuddyFlagCatalogVariant>
	) => {
		setDraftVariants((prev) =>
			prev.map((v, i) => (i === idx ? { ...v, ...patch } : v))
		);
	};

	return (
		<div className="flag-manage">
			<div className="flag-manage-row">
				<label className="flag-manage-label">
					<input
						checked={draftDefault}
						onChange={(e) => setDraftDefault(e.currentTarget.checked)}
						type="checkbox"
					/>
					<span>Default on</span>
				</label>
				<span className="flag-manage-type">{entry.type}</span>
			</div>
			<label className="field-label">Description</label>
			<input
				className="input"
				onChange={(e) => setDraftDesc(e.currentTarget.value)}
				placeholder="Optional"
				type="text"
				value={draftDesc}
			/>
			{entry.type === "multivariant" ? (
				<div className="flag-manage-variants">
					<div className="field-label">Variants</div>
					{draftVariants.length === 0 ? (
						<div className="hint">No variants yet.</div>
					) : (
						draftVariants.map((variant, idx) => (
							<div className="flag-manage-variant" key={`${idx}-${variant.key}`}>
								<input
									className="input mono"
									onChange={(e) =>
										patchVariant(idx, { key: e.currentTarget.value })
									}
									placeholder="key"
									type="text"
									value={variant.key}
								/>
								<input
									className="input mono"
									onChange={(e) =>
										patchVariant(idx, {
											value:
												variant.type === "number"
													? Number(e.currentTarget.value)
													: e.currentTarget.value,
										})
									}
									placeholder="value"
									type="text"
									value={String(variant.value)}
								/>
								<button
									aria-label="Remove variant"
									className="icon-btn"
									onClick={() => removeVariant(idx)}
									type="button"
								>
									<TrashIcon />
								</button>
							</div>
						))
					)}
					<button className="btn btn--ghost" onClick={addVariant} type="button">
						Add variant
					</button>
				</div>
			) : null}
			{error ? <div className="hint hint--error">{error}</div> : null}
			<div className="button-row">
				<button
					className="btn btn--primary"
					disabled={!dirty || pending !== null}
					onClick={save}
					type="button"
				>
					{pending === "save" ? "Saving…" : "Save"}
				</button>
				<button
					className="btn btn--ghost btn--danger"
					disabled={pending !== null}
					onClick={remove}
					type="button"
				>
					{pending === "delete" ? "Deleting…" : "Delete"}
				</button>
			</div>
		</div>
	);
}

function UnavailableFlagRow({
	entry,
	onDelete,
}: {
	entry: DatabuddyFlagCatalogEntry;
	onDelete: PanelProps["onDeleteFlag"];
}) {
	const [pending, setPending] = useState(false);
	const remove = async () => {
		setPending(true);
		await onDelete(entry.id);
		setPending(false);
	};
	return (
		<div className="flag-lite flag-lite--unavailable">
			<span aria-hidden="true" className="switch switch--disabled">
				<span className="switch-knob" />
			</span>
			<span className="flag-key">{entry.key}</span>
			<span className="flag-badges">
				<span className="flag-chip flag-chip--muted">{entry.type}</span>
				<span className="flag-source-tag flag-source-tag--unavailable">
					unavailable
				</span>
			</span>
			<button
				aria-label="Delete flag"
				className="icon-btn"
				disabled={pending}
				onClick={remove}
				type="button"
			>
				<TrashIcon />
			</button>
			{entry.description ? (
				<div className="flag-desc">{entry.description}</div>
			) : null}
		</div>
	);
}

function NewFlagForm({
	onCreate,
	onCancel,
}: {
	onCreate: PanelProps["onCreateFlag"];
	onCancel: () => void;
}) {
	const [key, setKey] = useState("");
	const [type, setType] = useState<"boolean" | "multivariant">("boolean");
	const [defaultValue, setDefaultValue] = useState(false);
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const submit = async () => {
		const trimmed = key.trim();
		if (trimmed === "") {
			setError("Key is required.");
			return;
		}
		setError(null);
		setPending(true);
		const result = await onCreate({
			key: trimmed,
			type,
			defaultValue,
			description: description.trim() === "" ? undefined : description.trim(),
		});
		setPending(false);
		if (result.ok) {
			onCancel();
			return;
		}
		setError(result.error ?? "Failed to create flag.");
	};

	return (
		<div className="flag-new">
			<label className="field-label">Key</label>
			<input
				className="input mono"
				onChange={(e) => setKey(e.currentTarget.value)}
				placeholder="new_feature"
				type="text"
				value={key}
			/>
			<div className="flag-new-row">
				<label className="flag-manage-label">
					<span>Type</span>
					<select
						className="input"
						onChange={(e) =>
							setType(e.currentTarget.value as "boolean" | "multivariant")
						}
						value={type}
					>
						<option value="boolean">Boolean</option>
						<option value="multivariant">Multivariant</option>
					</select>
				</label>
				<label className="flag-manage-label">
					<input
						checked={defaultValue}
						onChange={(e) => setDefaultValue(e.currentTarget.checked)}
						type="checkbox"
					/>
					<span>Default on</span>
				</label>
			</div>
			<label className="field-label">Description</label>
			<input
				className="input"
				onChange={(e) => setDescription(e.currentTarget.value)}
				placeholder="Optional"
				type="text"
				value={description}
			/>
			{error ? <div className="hint hint--error">{error}</div> : null}
			<div className="button-row">
				<button
					className="btn btn--primary"
					disabled={pending}
					onClick={submit}
					type="button"
				>
					{pending ? "Creating…" : "Create flag"}
				</button>
				<button
					className="btn btn--ghost"
					disabled={pending}
					onClick={onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

function FlagAdminStrip({
	adminKey,
	adminApiUrl,
	catalog,
	onSetKey,
	onSetApiUrl,
	onFetch,
}: {
	adminKey: string | null;
	adminApiUrl: string | null;
	catalog: FlagCatalogState;
	onSetKey: (key: string | null) => void;
	onSetApiUrl: (url: string | null) => void;
	onFetch: () => void;
}) {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [keyDraft, setKeyDraft] = useState(adminKey ?? "");
	const [urlDraft, setUrlDraft] = useState(adminApiUrl ?? "");

	const activeUrl = adminApiUrl ?? DEFAULT_ADMIN_API_URL;
	const keyDirty = keyDraft.trim() !== (adminKey ?? "");
	const urlDirty =
		urlDraft.trim().replace(TRAILING_SLASH_RE, "") !== (adminApiUrl ?? "");

	const save = () => {
		if (keyDirty) {
			const trimmed = keyDraft.trim();
			onSetKey(trimmed === "" ? null : trimmed);
		}
		if (urlDirty) {
			const trimmed = urlDraft.trim().replace(TRAILING_SLASH_RE, "");
			onSetApiUrl(trimmed === "" ? null : trimmed);
		}
	};

	const clearAll = () => {
		setKeyDraft("");
		setUrlDraft("");
		onSetKey(null);
		onSetApiUrl(null);
	};

	if (!adminKey && !settingsOpen) {
		return (
			<div className="flag-admin-strip flag-admin-strip--cta">
				<span className="flag-admin-label">
					<FlagIcon /> Connect an API key to manage flags
				</span>
				<button
					className="btn btn--primary"
					onClick={() => setSettingsOpen(true)}
					type="button"
				>
					Connect
				</button>
			</div>
		);
	}

	if (adminKey && !settingsOpen) {
		const status =
			catalog.status === "loading"
				? "Loading catalog…"
				: catalog.status === "error"
					? (catalog.error ?? "Failed to load catalog.")
					: catalog.status === "ready"
						? `${catalog.entries.length} flag${catalog.entries.length === 1 ? "" : "s"} in catalog`
						: "Catalog not loaded yet.";
		return (
			<div
				className={`flag-admin-strip ${catalog.status === "error" ? "flag-admin-strip--error" : ""}`}
			>
				<span className="flag-admin-label">
					<span className={`dot dot--${catalog.status === "error" ? "danger" : "ok"} dot--mini`} />
					{status}
				</span>
				<div className="button-row">
					<button
						className="btn btn--ghost"
						disabled={catalog.status === "loading"}
						onClick={onFetch}
						type="button"
					>
						<RefreshIcon />
					</button>
					<button
						aria-label="API key settings"
						className="btn btn--ghost"
						onClick={() => setSettingsOpen(true)}
						type="button"
					>
						Settings
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flag-admin-settings">
			<label className="field-label">API key</label>
			<input
				className="input mono"
				onChange={(e) => setKeyDraft(e.currentTarget.value)}
				placeholder="dbd_…"
				type="password"
				value={keyDraft}
			/>
			<label className="field-label">API URL</label>
			<input
				className="input mono"
				onChange={(e) => setUrlDraft(e.currentTarget.value)}
				placeholder={DEFAULT_ADMIN_API_URL}
				type="text"
				value={urlDraft}
			/>
			<div className="hint">
				Calls {activeUrl}/public/v1/flags/definitions
			</div>
			<div className="button-row">
				<button
					className="btn btn--primary"
					disabled={!(keyDirty || urlDirty)}
					onClick={() => {
						save();
						setSettingsOpen(false);
					}}
					type="button"
				>
					Save
				</button>
				<button
					className="btn btn--ghost"
					onClick={() => setSettingsOpen(false)}
					type="button"
				>
					Close
				</button>
				{adminKey || adminApiUrl ? (
					<button
						className="btn btn--ghost btn--danger"
						onClick={() => {
							clearAll();
							setSettingsOpen(false);
						}}
						type="button"
					>
						Disconnect
					</button>
				) : null}
			</div>
		</div>
	);
}

function FlagsSection({
	flags,
	catalog,
	adminKey,
	adminApiUrl,
	onSetOverride,
	onClearOverride,
	onRefresh,
	onCreateFlag,
	onUpdateFlag,
	onDeleteFlag,
	onSetAdminKey,
	onSetAdminApiUrl,
	onFetchCatalog,
}: {
	flags: DatabuddyFlagsSnapshot;
	catalog: FlagCatalogState;
	adminKey: string | null;
	adminApiUrl: string | null;
	onSetOverride: PanelProps["onSetFlagOverride"];
	onClearOverride: PanelProps["onClearFlagOverride"];
	onRefresh: () => void;
	onCreateFlag: PanelProps["onCreateFlag"];
	onUpdateFlag: PanelProps["onUpdateFlag"];
	onDeleteFlag: PanelProps["onDeleteFlag"];
	onSetAdminKey: PanelProps["onSetAdminKey"];
	onSetAdminApiUrl: PanelProps["onSetAdminApiUrl"];
	onFetchCatalog: PanelProps["onFetchCatalog"];
}) {
	const [newOpen, setNewOpen] = useState(false);

	const catalogByKey = useMemo(
		() => new Map(catalog.entries.map((e) => [e.key, e])),
		[catalog.entries]
	);
	const evaluatedKeys = useMemo(
		() => new Set(flags.flags.map((f) => f.key)),
		[flags.flags]
	);
	const unavailable = useMemo(
		() => catalog.entries.filter((entry) => !evaluatedKeys.has(entry.key)),
		[catalog.entries, evaluatedKeys]
	);

	if (!flags.available) {
		return null;
	}

	const overrideCount = flags.flags.filter(
		(f) => f.source === "override"
	).length;

	const totalCount = flags.flags.length + unavailable.length;
	const canManage = adminKey !== null && catalog.status === "ready";

	const clearAll = () => {
		for (const f of flags.flags) {
			if (f.source === "override") {
				onClearOverride(f.key);
			}
		}
	};

	return (
		<div className="panel-section">
			<div className="panel-section-head">
				<span className="panel-section-title">
					<FlagIcon /> Flags
					<span className="panel-section-count">{totalCount}</span>
				</span>
				<div className="button-row">
					{canManage ? (
						<button
							className="btn btn--ghost"
							onClick={() => setNewOpen((p) => !p)}
							type="button"
						>
							{newOpen ? "Close" : "New flag"}
						</button>
					) : null}
					{overrideCount > 0 ? (
						<button
							className="btn btn--ghost"
							onClick={clearAll}
							type="button"
						>
							Clear overrides
						</button>
					) : null}
					<button className="btn btn--ghost" onClick={onRefresh} type="button">
						<RefreshIcon />
					</button>
				</div>
			</div>
			<FlagAdminStrip
				adminApiUrl={adminApiUrl}
				adminKey={adminKey}
				catalog={catalog}
				onFetch={onFetchCatalog}
				onSetApiUrl={onSetAdminApiUrl}
				onSetKey={onSetAdminKey}
			/>
			{canManage && newOpen ? (
				<NewFlagForm onCancel={() => setNewOpen(false)} onCreate={onCreateFlag} />
			) : null}
			{totalCount === 0 ? (
				<div className="empty empty--compact">
					<div className="hint">
						{flags.isReady ? "No flags returned." : "Loading flags…"}
					</div>
				</div>
			) : (
				<div>
					{flags.flags.map((flag) => (
						<FlagRow
							canManage={canManage}
							catalogEntry={catalogByKey.get(flag.key) ?? null}
							flag={flag}
							key={flag.key}
							onClearOverride={onClearOverride}
							onCreateFlag={onCreateFlag}
							onDeleteFlag={onDeleteFlag}
							onSetOverride={onSetOverride}
							onUpdateFlag={onUpdateFlag}
						/>
					))}
					{unavailable.map((entry) => (
						<UnavailableFlagRow
							entry={entry}
							key={entry.key}
							onDelete={onDeleteFlag}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function EventsSection({
	events,
	onClear,
}: {
	events: DatabuddyDevtoolsEvent[];
	onClear: () => void;
}) {
	const [showAll, setShowAll] = useState(false);
	const visible = showAll ? events : events.slice(0, EVENT_PREVIEW_COUNT);
	const remaining = events.length - visible.length;

	return (
		<div className="panel-section">
			<div className="panel-section-head">
				<span className="panel-section-title">
					Events
					<span className="panel-section-count">{events.length}</span>
				</span>
				{events.length > 0 ? (
					<button
						className="btn btn--ghost btn--danger"
						onClick={onClear}
						type="button"
					>
						<TrashIcon />
					</button>
				) : null}
			</div>
			{events.length === 0 ? (
				<div className="empty empty--compact">
					<InboxIcon />
					<div className="hint">No events yet. Trigger a page view or hit Test.</div>
				</div>
			) : (
				<div>
					{visible.map((event) => (
						<div className="event" key={event.id}>
							<span className={`event-tag event-tag--${event.type}`}>
								{event.type}
							</span>
							<span className="event-name">{event.name}</span>
							<span className="event-time">
								{TIME_FORMAT.format(event.timestamp)}
							</span>
							{event.properties ? (
								<span className="event-payload">
									{JSON.stringify(event.properties)}
								</span>
							) : null}
						</div>
					))}
					{remaining > 0 && !showAll ? (
						<button
							className="btn btn--ghost panel-show-more"
							onClick={() => setShowAll(true)}
							type="button"
						>
							Show {remaining} more
						</button>
					) : null}
					{showAll && events.length > EVENT_PREVIEW_COUNT ? (
						<button
							className="btn btn--ghost panel-show-more"
							onClick={() => setShowAll(false)}
							type="button"
						>
							Collapse
						</button>
					) : null}
				</div>
			)}
		</div>
	);
}

function CustomEventComposer({
	onSubmit,
}: {
	onSubmit: PanelProps["onTrackCustom"];
}) {
	const [name, setName] = useState("");
	const [propsText, setPropsText] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleSend = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setError("Name is required");
			return;
		}
		let parsed: Record<string, unknown> = {};
		const body = propsText.trim();
		if (body) {
			try {
				const value = JSON.parse(body);
				if (!value || typeof value !== "object" || Array.isArray(value)) {
					setError("Properties must be a JSON object");
					return;
				}
				parsed = value as Record<string, unknown>;
			} catch (err) {
				setError(err instanceof Error ? err.message : "Invalid JSON");
				return;
			}
		}
		setError(null);
		onSubmit(trimmed, parsed);
		setName("");
		setPropsText("");
	};

	return (
		<div className="stacked" style={{ padding: "0 12px 12px" }}>
			<input
				className="input"
				onChange={(e) => setName(e.currentTarget.value)}
				placeholder="event_name"
				type="text"
				value={name}
			/>
			<textarea
				className="input mono composer-textarea"
				onChange={(e) => setPropsText(e.currentTarget.value)}
				placeholder='{"prop":"value"}'
				rows={3}
				value={propsText}
			/>
			{error ? <div className="form-error">{error}</div> : null}
			<div>
				<button
					className="btn btn--primary"
					onClick={handleSend}
					type="button"
				>
					<PlayIcon /> Send
				</button>
			</div>
		</div>
	);
}

function GlobalPropertyComposer({
	onAdd,
}: {
	onAdd: PanelProps["onSetGlobalProperty"];
}) {
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");

	const handleAdd = () => {
		const trimmedKey = key.trim();
		if (!trimmedKey) {
			return;
		}
		onAdd(trimmedKey, parseInputValue(value));
		setKey("");
		setValue("");
	};

	return (
		<div className="composer">
			<input
				className="input composer-field"
				onChange={(e) => setKey(e.currentTarget.value)}
				placeholder="key"
				type="text"
				value={key}
			/>
			<input
				className="input mono composer-field"
				onChange={(e) => setValue(e.currentTarget.value)}
				placeholder="value"
				type="text"
				value={value}
			/>
			<button
				className="btn btn--primary"
				disabled={!key.trim()}
				onClick={handleAdd}
				type="button"
			>
				Set
			</button>
		</div>
	);
}

function AdvancedSection({
	identity,
	snapshot,
	queue,
	diagnostics,
	onTrackCustom,
	onSetGlobalProperty,
	onRemoveGlobalProperty,
	onClearGlobalProperties,
}: {
	identity: DatabuddyIdentitySnapshot;
	snapshot: DatabuddyTrackerSnapshot;
	queue: DatabuddyQueueSnapshot;
	diagnostics: DiagnosticItem[];
	onTrackCustom: PanelProps["onTrackCustom"];
	onSetGlobalProperty: PanelProps["onSetGlobalProperty"];
	onRemoveGlobalProperty: PanelProps["onRemoveGlobalProperty"];
	onClearGlobalProperties: PanelProps["onClearGlobalProperties"];
}) {
	const globalEntries = Object.entries(identity.globalProperties);
	const urlParamEntries = Object.entries(identity.urlParams);
	const populatedKeys = identity.storageKeys.filter((k) => k.value !== null);
	const configRows = useMemo(() => {
		if (!snapshot.options) {
			return [] as Array<{ key: string; display: string; muted: boolean }>;
		}
		return Object.keys(snapshot.options)
			.sort()
			.map((key) => {
				const value = snapshot.options?.[key];
				const display = formatValue(value);
				const muted =
					value === false ||
					value === null ||
					value === undefined ||
					value === "" ||
					(Array.isArray(value) && value.length === 0);
				return { key, display, muted };
			});
	}, [snapshot.options]);

	return (
		<details className="fold panel-advanced">
			<summary>
				<ChevronIcon />
				Advanced
			</summary>

			<details className="fold">
				<summary>
					<ChevronIcon />
					Global properties
					<span className="fold-count">{globalEntries.length}</span>
				</summary>
				{globalEntries.length === 0 ? (
					<div className="empty empty--compact">
						<div className="hint">None set. Add below.</div>
					</div>
				) : (
					<div className="section">
						{globalEntries.map(([key, value]) => (
							<div className="row" key={key}>
								<span className="row-label">{key}</span>
								<span className="row-value mono">
									{typeof value === "string" ? value : JSON.stringify(value)}
									<button
										aria-label={`Remove ${key}`}
										className="icon-btn"
										onClick={() => onRemoveGlobalProperty(key)}
										type="button"
									>
										<TrashIcon />
									</button>
								</span>
							</div>
						))}
					</div>
				)}
				<GlobalPropertyComposer onAdd={onSetGlobalProperty} />
				{globalEntries.length > 0 ? (
					<div className="fold-footer">
						<button
							className="btn btn--ghost btn--danger"
							onClick={onClearGlobalProperties}
							type="button"
						>
							<TrashIcon /> Clear all
						</button>
					</div>
				) : null}
			</details>

			<details className="fold">
				<summary>
					<ChevronIcon />
					Track custom event
				</summary>
				<CustomEventComposer onSubmit={onTrackCustom} />
			</details>

			<details className="fold">
				<summary>
					<ChevronIcon />
					Queues
					<span className="fold-count">
						{queue.available ? "live" : "debug required"}
					</span>
				</summary>
				<div className="section">
					<div className="queue-chip-group">
						{QUEUE_LABELS.map(({ key, label }) => (
							<div
								className="queue-chip"
								data-flushing={queue.flushing[key] ? "true" : "false"}
								key={key}
							>
								<div className="queue-chip-count">{queue.queues[key]}</div>
								<div className="queue-chip-label">{label}</div>
							</div>
						))}
					</div>
					{queue.maxScrollDepth !== null ? (
						<div className="meta-text">
							scroll {queue.maxScrollDepth}% · {queue.interactionCount ?? 0}{" "}
							interactions
						</div>
					) : null}
				</div>
			</details>

			{urlParamEntries.length > 0 ? (
				<details className="fold">
					<summary>
						<ChevronIcon />
						URL parameters
						<span className="fold-count">{urlParamEntries.length}</span>
					</summary>
					<div className="section">
						{urlParamEntries.map(([key, value]) => (
							<div className="row" key={key}>
								<span className="row-label">{key}</span>
								<span className="row-value mono">{value}</span>
							</div>
						))}
					</div>
				</details>
			) : null}

			<details className="fold">
				<summary>
					<ChevronIcon />
					Storage keys
					<span className="fold-count">
						{populatedKeys.length}/{identity.storageKeys.length}
					</span>
				</summary>
				<div className="section">
					{identity.storageKeys.map((entry) => (
						<div className="row" key={`${entry.scope}:${entry.key}`}>
							<span className="row-label">
								<span className="scope-tag">{entry.scope}</span>
								{entry.key}
							</span>
							<span
								className={`row-value mono ${entry.value ? "" : "id-value--muted"}`}
							>
								{entry.value ?? "—"}
							</span>
						</div>
					))}
				</div>
			</details>

			<details className="fold">
				<summary>
					<ChevronIcon />
					Tracker config
					<span className="fold-count">{configRows.length}</span>
				</summary>
				{configRows.length === 0 ? (
					<div className="empty empty--compact">
						<div className="hint">No tracker options resolved.</div>
					</div>
				) : (
					<div className="section">
						{configRows.map(({ key, display, muted }) => (
							<div className="row" key={key}>
								<span className="row-label">{key}</span>
								<span
									className={`row-value mono ${muted ? "id-value--muted" : ""}`}
								>
									{display}
								</span>
							</div>
						))}
					</div>
				)}
			</details>

			<details className="fold">
				<summary>
					<ChevronIcon />
					Diagnostics
					<span className="fold-count">{diagnostics.length}</span>
				</summary>
				<div>
					{diagnostics.map((item) => {
						const Icon = STATUS_ICONS[item.status];
						return (
							<div className="diag" key={item.id}>
								<span className={`diag-icon diag-icon--${item.status}`}>
									<Icon />
								</span>
								<div>
									<div className="diag-label">{item.label}</div>
									{item.hint ? (
										<div className="diag-hint">{item.hint}</div>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</details>
		</details>
	);
}

export function Panel(props: PanelProps) {
	return (
		<>
			<div className="panel-scroll">
				<StatusStrip
					diagnostics={props.diagnostics}
					events={props.events}
					runtime={props.runtime}
				/>
				<IdentityStrip
					identity={props.identity}
					onResetSession={props.onResetSession}
				/>
				<FlagsSection
					adminApiUrl={props.adminApiUrl}
					adminKey={props.adminKey}
					catalog={props.catalog}
					flags={props.flags}
					onClearOverride={props.onClearFlagOverride}
					onCreateFlag={props.onCreateFlag}
					onDeleteFlag={props.onDeleteFlag}
					onFetchCatalog={props.onFetchCatalog}
					onRefresh={props.onRefreshFlags}
					onSetAdminApiUrl={props.onSetAdminApiUrl}
					onSetAdminKey={props.onSetAdminKey}
					onSetOverride={props.onSetFlagOverride}
					onUpdateFlag={props.onUpdateFlag}
				/>
				<EventsSection events={props.events} onClear={props.onClearEvents} />
				<AdvancedSection
					diagnostics={props.diagnostics}
					identity={props.identity}
					onClearGlobalProperties={props.onClearGlobalProperties}
					onRemoveGlobalProperty={props.onRemoveGlobalProperty}
					onSetGlobalProperty={props.onSetGlobalProperty}
					onTrackCustom={props.onTrackCustom}
					queue={props.queue}
					snapshot={props.snapshot}
				/>
			</div>

			<div className="action-bar">
				<button
					className="btn btn--primary"
					onClick={props.onTrackTest}
					type="button"
				>
					<PlayIcon /> Track test
				</button>
				<button className="btn" onClick={props.onFlush} type="button">
					Flush
				</button>
				<button className="btn" onClick={props.onRefreshFlags} type="button">
					<RefreshIcon /> Flags
				</button>
			</div>
		</>
	);
}

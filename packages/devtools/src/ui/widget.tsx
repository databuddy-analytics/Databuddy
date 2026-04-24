import type { JSX } from "preact";
import { useCallback, useRef } from "preact/hooks";
import { attachDrag, attachResize } from "./drag";
import { CloseIcon, DatabuddyMark } from "./icons";
import { runtimeStatus, store } from "./store";
import { useStoreState } from "./use-store";
import { Panel } from "./views/panel";

const adapter = store.getAdapter();

const stopPointer = (e: JSX.TargetedPointerEvent<HTMLElement>) =>
	e.stopPropagation();

const onTrackTest = () => adapter.runAction("trackTest");
const onFlush = () => adapter.runAction("flush");
const onResetSession = () => adapter.runAction("resetSession");
const onRefreshFlags = () => adapter.runAction("refreshFlags");
const onClearEvents = () => adapter.clearEvents();
const onClearGlobalProperties = () => adapter.runAction("clearGlobalProperties");

const onSetFlagOverride = (
	key: string,
	override: {
		enabled: boolean;
		value: boolean | string | number;
		variant?: string;
	}
) => {
	adapter.runAction("setFlagOverride", {
		__key: key,
		__enabled: override.enabled,
		__value: override.value,
		__variant: override.variant,
	});
};
const onClearFlagOverride = (key: string) =>
	adapter.runAction("clearFlagOverride", { __key: key });
const onTrackCustom = (name: string, properties: Record<string, unknown>) =>
	adapter.runAction("trackCustom", { __name: name, ...properties });
const onSetGlobalProperty = (key: string, value: unknown) =>
	adapter.runAction("setGlobalProperty", { __key: key, __value: value });
const onRemoveGlobalProperty = (key: string) =>
	adapter.runAction("removeGlobalProperty", { __key: key });

const onSetAdminKey = (key: string | null) => store.setAdminKey(key);
const onSetAdminApiUrl = (url: string | null) => store.setAdminApiUrl(url);
const onFetchCatalog = () => {
	store.fetchCatalog().catch(() => undefined);
};
const onCreateFlag: typeof store.createFlag = (input) => store.createFlag(input);
const onUpdateFlag: typeof store.updateFlag = (id, input) =>
	store.updateFlag(id, input);
const onDeleteFlag: typeof store.deleteFlag = (id) => store.deleteFlag(id);

export function Widget() {
	const state = useStoreState();
	const hostRef = useRef<HTMLDivElement | null>(null);
	const shellRef = useRef<HTMLDivElement | null>(null);

	const pillRef = useCallback((el: HTMLElement | null) => {
		if (!el) {
			return;
		}
		return attachDrag(el, hostRef, () => store.setOpen(true));
	}, []);

	const headerRef = useCallback((el: HTMLElement | null) => {
		if (!el) {
			return;
		}
		return attachDrag(el, hostRef);
	}, []);

	const resizeRef = useCallback((el: HTMLElement | null) => {
		if (!el) {
			return;
		}
		return attachResize(el, shellRef);
	}, []);

	const runtime = runtimeStatus(state.snapshot);
	const dotClass = `dot dot--${runtime.tone}`;

	const hostStyle = {
		"--pos-x": `${state.position.x}px`,
		"--pos-y": `${state.position.y}px`,
		transform:
			"translate3d(calc(var(--pos-x) + var(--drag-x, 0px)), calc(var(--pos-y) + var(--drag-y, 0px)), 0)",
	} as JSX.CSSProperties;

	const shellStyle = state.open
		? ({ width: state.size.w, height: state.size.h } as JSX.CSSProperties)
		: undefined;

	return (
		<div className="host" ref={hostRef} style={hostStyle}>
			<div
				className={`shell ${state.open ? "expanded" : "collapsed"}`}
				ref={shellRef}
				style={shellStyle}
			>
				{state.open ? (
					<>
						<div className="header" ref={headerRef}>
							<div className="header-title">
								<DatabuddyMark className="brand-mark" />
								<span className="title-text">Databuddy</span>
							</div>
							<div className="header-actions">
								<button
									aria-label="Close devtools"
									className="icon-btn"
									onClick={() => store.setOpen(false)}
									onPointerDown={stopPointer}
									type="button"
								>
									<CloseIcon />
								</button>
							</div>
						</div>

						<Panel
							adminApiUrl={state.adminApiUrl}
							adminKey={state.adminKey}
							catalog={state.catalog}
							diagnostics={state.diagnostics}
							events={state.events}
							flags={state.flags}
							identity={state.identity}
							onClearEvents={onClearEvents}
							onClearFlagOverride={onClearFlagOverride}
							onClearGlobalProperties={onClearGlobalProperties}
							onCreateFlag={onCreateFlag}
							onDeleteFlag={onDeleteFlag}
							onFetchCatalog={onFetchCatalog}
							onFlush={onFlush}
							onRefreshFlags={onRefreshFlags}
							onRemoveGlobalProperty={onRemoveGlobalProperty}
							onResetSession={onResetSession}
							onSetAdminApiUrl={onSetAdminApiUrl}
							onSetAdminKey={onSetAdminKey}
							onSetFlagOverride={onSetFlagOverride}
							onSetGlobalProperty={onSetGlobalProperty}
							onTrackCustom={onTrackCustom}
							onTrackTest={onTrackTest}
							onUpdateFlag={onUpdateFlag}
							queue={state.queue}
							runtime={runtime}
							snapshot={state.snapshot}
						/>

						<div aria-label="Resize" className="resize" ref={resizeRef} />
					</>
				) : (
					<div className="pill" ref={pillRef}>
						<DatabuddyMark className="brand-mark" />
						<span className="pill-meta">
							<span className="pill-label">Databuddy</span>
							<span className="pill-sub">
								<span className={`${dotClass} dot--mini`} />
								{state.events.length} event
								{state.events.length === 1 ? "" : "s"}
							</span>
						</span>
					</div>
				)}
			</div>
		</div>
	);
}

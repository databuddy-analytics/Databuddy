import { AsyncLocalStorage } from "node:async_hooks";

type TrackFn = (
	name: string,
	opts: {
		namespace: string;
		sessionId?: string | null;
		anonymousId?: string | null;
		properties?: Record<string, unknown>;
	}
) => void;

let _trackFn: TrackFn | null = null;

const trackingStore = new AsyncLocalStorage<{
	properties: Record<string, unknown> | null;
}>();

export function setTrackingFn(fn: TrackFn) {
	_trackFn = fn;
}

export function setTrackProperties(props: Record<string, unknown>) {
	const store = trackingStore.getStore();
	if (store) {
		store.properties = props;
	}
}

const NAME_OVERRIDES: Record<string, string> = {
	"uptime.createSchedule": "monitor_created",
	"uptime.updateSchedule": "monitor_updated",
	"uptime.deleteSchedule": "monitor_deleted",
	"uptime.togglePause": "monitor_toggled_pause",
	"uptime.pauseSchedule": "monitor_paused",
	"uptime.resumeSchedule": "monitor_resumed",
	"uptime.manualCheck": "monitor_checked",
	"uptime.transfer": "monitor_transferred",
	"statusPage.createIncident": "incident_created",
	"statusPage.updateIncident": "incident_updated",
	"statusPage.deleteIncident": "incident_deleted",
	"statusPage.addMonitor": "status_page_monitor_added",
	"statusPage.removeMonitor": "status_page_monitor_removed",
	"statusPage.updateMonitorSettings": "status_page_monitor_updated",
	"linkFolders.create": "link_folder_created",
	"linkFolders.update": "link_folder_updated",
	"linkFolders.delete": "link_folder_deleted",
	"targetGroups.create": "target_group_created",
	"targetGroups.update": "target_group_updated",
	"targetGroups.delete": "target_group_deleted",
	"agentChats.rename": "agent_chat_renamed",
	"agentChats.delete": "agent_chat_deleted",
	"apikeys.create": "api_key_created",
	"apikeys.update": "api_key_updated",
	"apikeys.revoke": "api_key_revoked",
	"apikeys.rotate": "api_key_rotated",
	"apikeys.delete": "api_key_deleted",
	"organizations.updateAvatarSeed": "org_avatar_updated",
	"organizations.updateEmailNotificationSettings":
		"email_notifications_updated",
	"organizations.clearExpiredInvitations": "expired_invitations_cleared",
	"preferences.updateUserPreferences": "preferences_updated",
	"billing.setAutoTopup": "auto_topup_set",
	"billing.setUsageAlert": "usage_alert_set",
	"billing.setSpendLimit": "spend_limit_set",
	"feedback.submit": "feedback_submitted",
	"feedback.redeemCredits": "credits_redeemed",
};

const VERB_MAP: Record<string, string> = {
	create: "created",
	add: "created",
	update: "updated",
	edit: "updated",
	delete: "deleted",
	remove: "deleted",
	revoke: "revoked",
	transfer: "transferred",
	rotate: "rotated",
	test: "tested",
	rename: "renamed",
};

const TRAILING_S = /s$/;
const TOGGLE_PREFIX = /^toggle(.+)$/;

function deriveEventName(path: string): string {
	if (NAME_OVERRIDES[path]) {
		return NAME_OVERRIDES[path];
	}

	const [router, method] = path.split(".");
	if (!(router && method)) {
		return path;
	}

	const singular = toSnakeCase(router.replace(TRAILING_S, ""));
	const verb = VERB_MAP[method];

	if (verb) {
		return `${singular}_${verb}`;
	}

	const toggleMatch = method.match(TOGGLE_PREFIX);
	if (toggleMatch) {
		return `${singular}_toggled_${toSnakeCase(toggleMatch[1])}`;
	}

	return `${singular}_${method}`;
}

function toSnakeCase(str: string): string {
	return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function deriveNamespace(path: string): string {
	return toSnakeCase(path.split(".")[0] ?? path);
}

export function runTracked<T>(
	path: string,
	context: { anonymousId?: string | null; sessionId?: string | null },
	fn: () => T
): T {
	const store = { properties: null as Record<string, unknown> | null };
	return trackingStore.run(store, () => {
		const result = fn();
		const maybeThenable = result as {
			then?: (cb: (v: unknown) => unknown) => unknown;
		};

		if (maybeThenable && typeof maybeThenable.then === "function") {
			return maybeThenable.then((resolved) => {
				fireAfterSuccess(store, path, context);
				return resolved;
			}) as T;
		}

		fireAfterSuccess(store, path, context);
		return result;
	});
}

function fireAfterSuccess(
	store: { properties: Record<string, unknown> | null },
	path: string,
	context: { anonymousId?: string | null; sessionId?: string | null }
) {
	if (!_trackFn) {
		return;
	}
	_trackFn(deriveEventName(path), {
		namespace: deriveNamespace(path),
		sessionId: context.sessionId,
		anonymousId: context.anonymousId,
		properties: store.properties ?? undefined,
	});
}

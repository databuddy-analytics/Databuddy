export interface WebsiteSecuritySettings {
	allowedIps?: string[];
	allowedOrigins?: string[];
	ignoredTrackingOrigins?: string[];
	trackingIssueWarningsDisabled?: boolean;
}

type StringListSettingKey =
	| "allowedIps"
	| "allowedOrigins"
	| "ignoredTrackingOrigins";

function omitSetting(
	settings: WebsiteSecuritySettings,
	key: keyof WebsiteSecuritySettings
): WebsiteSecuritySettings {
	const { [key]: _value, ...rest } = settings;
	return rest;
}

function setStringList(
	settings: WebsiteSecuritySettings,
	key: StringListSettingKey,
	value: string[] | undefined
): WebsiteSecuritySettings {
	if (value === undefined) {
		return settings;
	}
	if (value.length === 0) {
		return omitSetting(settings, key);
	}
	return { ...settings, [key]: value };
}

function hasOwnSetting(
	settings: WebsiteSecuritySettings,
	key: keyof WebsiteSecuritySettings
): boolean {
	return Object.hasOwn(settings, key);
}

export function mergeWebsiteSecuritySettings(
	current: WebsiteSecuritySettings | null | undefined,
	patch: WebsiteSecuritySettings
): WebsiteSecuritySettings | null {
	const hasOrigins = hasOwnSetting(patch, "allowedOrigins");
	const hasIps = hasOwnSetting(patch, "allowedIps");
	const hasIgnoredOrigins = hasOwnSetting(patch, "ignoredTrackingOrigins");
	const hasTrackingWarningsDisabled = hasOwnSetting(
		patch,
		"trackingIssueWarningsDisabled"
	);

	if (
		!(hasOrigins || hasIps || hasIgnoredOrigins || hasTrackingWarningsDisabled)
	) {
		return current ?? null;
	}

	let next: WebsiteSecuritySettings = { ...(current ?? {}) };

	if (hasOrigins) {
		next = setStringList(next, "allowedOrigins", patch.allowedOrigins);
	}

	if (hasIps) {
		next = setStringList(next, "allowedIps", patch.allowedIps);
	}

	if (hasIgnoredOrigins) {
		next = setStringList(
			next,
			"ignoredTrackingOrigins",
			patch.ignoredTrackingOrigins
		);
	}

	if (hasTrackingWarningsDisabled) {
		if (patch.trackingIssueWarningsDisabled) {
			next.trackingIssueWarningsDisabled = true;
		} else {
			next = omitSetting(next, "trackingIssueWarningsDisabled");
		}
	}

	return next.allowedOrigins?.length ||
		next.allowedIps?.length ||
		next.ignoredTrackingOrigins?.length ||
		next.trackingIssueWarningsDisabled
		? next
		: null;
}

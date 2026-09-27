export const API_SCOPES = [
	"read:data",
	"track:events",
	"read:links",
	"write:links",
	"read:monitors",
	"write:monitors",
	"read:status_pages",
	"write:status_pages",
	"manage:websites",
	"manage:flags",
	"manage:config",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
	return (API_SCOPES as readonly string[]).includes(value);
}

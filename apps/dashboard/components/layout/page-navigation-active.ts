export interface PageNavigationRoute {
	href: string;
	id: string;
}

const TRAILING_SLASHES_RE = /\/+$/;

function normalizePath(path: string): string {
	if (path === "/") {
		return path;
	}
	return path.replace(TRAILING_SLASHES_RE, "");
}

function isPathInSection(pathname: string, href: string): boolean {
	const normalizedPathname = normalizePath(pathname);
	const normalizedHref = normalizePath(href);
	return (
		normalizedPathname === normalizedHref ||
		normalizedPathname.startsWith(`${normalizedHref}/`)
	);
}

export function getActivePageNavigationTabId(
	tabs: PageNavigationRoute[],
	pathname: string
): string | null {
	let active: PageNavigationRoute | null = null;
	for (const tab of tabs) {
		if (!isPathInSection(pathname, tab.href)) {
			continue;
		}
		if (
			!active ||
			normalizePath(tab.href).length > normalizePath(active.href).length
		) {
			active = tab;
		}
	}
	return active?.id ?? null;
}

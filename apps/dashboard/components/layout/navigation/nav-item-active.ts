import type { NavigationItem } from "./types";

const buildFullPath = (basePath: string, itemHref: string) =>
	itemHref === "" ? basePath : `${basePath}${itemHref}`;

export function isNavItemActive(
	item: NavigationItem,
	pathname: string,
	currentWebsiteId?: string | null
): boolean {
	if (item.rootLevel) {
		return pathname === item.href;
	}

	const fullPath = (() => {
		if (pathname.startsWith("/demo")) {
			return buildFullPath(`/demo/${currentWebsiteId}`, item.href);
		}
		return buildFullPath(`/websites/${currentWebsiteId}`, item.href);
	})();

	if (item.href === "") {
		return pathname === fullPath;
	}

	return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
}

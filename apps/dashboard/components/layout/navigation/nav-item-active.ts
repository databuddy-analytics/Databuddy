import type { NavigationItem } from "./types";

const buildFullPath = (basePath: string, itemHref: string) =>
	itemHref === "" ? basePath : `${basePath}${itemHref}`;

export function isNavItemActive(
	item: NavigationItem,
	pathname: string,
	currentWebsiteId?: string | null
): boolean {
	if (item.rootLevel) {
		if (pathname === item.href) {
			return true;
		}
		if (item.activeMatch !== "prefix") {
			return false;
		}
		if (
			item.activePathExclusions?.some(
				(path) => pathname === path || pathname.startsWith(`${path}/`)
			)
		) {
			return false;
		}
		return pathname.startsWith(`${item.href}/`);
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

import { atom } from "jotai";

export const isSidebarCollapsedAtom = atom(false);

export const toggleSidebarAtom = atom(
	(get) => get(isSidebarCollapsedAtom),
	(get, set) => {
		set(isSidebarCollapsedAtom, !get(isSidebarCollapsedAtom));
	}
);

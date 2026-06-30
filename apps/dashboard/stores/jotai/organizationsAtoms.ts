import { atom } from "jotai";
import type { Organization } from "./organization-types";

export const organizationsAtom = atom<Organization[]>([]);
export const activeOrganizationAtom = atom<Organization | null>(null);
export const pendingActiveOrganizationIdAtom = atom<string | null>(null);
export const isLoadingOrganizationsAtom = atom<boolean>(true);

export const getOrganizationBySlugAtom = atom((get) => (orgSlug: string) => {
	const orgs = get(organizationsAtom);
	return orgs.find((org) => org.slug === orgSlug);
});

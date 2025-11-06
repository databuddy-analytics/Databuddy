import type { invitation } from "@databuddy/db";
import dayjs from "dayjs";
import { atom } from "jotai";

export type Invitation = typeof invitation.$inferSelect;

export type InvitationTab = "pending" | "expired" | "accepted";

export const invitationsAtom = atom<Invitation[]>([]);
export const isLoadingInvitationsAtom = atom<boolean>(false);
export const selectedTabAtom = atom<InvitationTab>("pending");
export const isInvitingMemberAtom = atom<boolean>(false);
export const isCancellingInvitationAtom = atom<boolean>(false);

// Derived atoms for each status
export const pendingInvitationsAtom = atom((get) =>
	get(invitationsAtom).filter(
		(inv) => inv.status === "pending" && dayjs(inv.expiresAt).isAfter(dayjs())
	)
);

export const expiredInvitationsAtom = atom((get) =>
	get(invitationsAtom).filter(
		(inv) => inv.status === "pending" && dayjs(inv.expiresAt).isBefore(dayjs())
	)
);

export const acceptedInvitationsAtom = atom((get) =>
	get(invitationsAtom).filter((inv) => inv.status === "accepted")
);

// Count atoms for tabs
export const pendingCountAtom = atom(
	(get) => get(pendingInvitationsAtom).length
);
export const expiredCountAtom = atom(
	(get) => get(expiredInvitationsAtom).length
);
export const acceptedCountAtom = atom(
	(get) => get(acceptedInvitationsAtom).length
);

export const filteredInvitationsAtom = atom((get) => {
	const selectedTab = get(selectedTabAtom);

	switch (selectedTab) {
		case "pending":
			return get(pendingInvitationsAtom);
		case "expired":
			return get(expiredInvitationsAtom);
		case "accepted":
			return get(acceptedInvitationsAtom);
		default:
			return get(pendingInvitationsAtom);
	}
});

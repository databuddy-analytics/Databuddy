export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InvitationPageStatus =
	| "loading"
	| "ready"
	| "accepting"
	| "success"
	| "error"
	| "expired"
	| "already-accepted";

export type InvitationData = {
	organizationName: string;
	organizationSlug: string;
	inviterEmail: string;
	id: string;
	email: string;
	status: InvitationStatus;
	expiresAt: Date;
	organizationId: string;
	role: string;
	inviterId: string;
	teamId?: string;
};

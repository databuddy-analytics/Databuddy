export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InvitationPageStatus =
	| "loading"
	| "ready"
	| "accepting"
	| "success"
	| "error"
	| "expired"
	| "already-accepted";

export interface InvitationData {
	email: string;
	expiresAt: Date;
	id: string;
	inviterEmail: string;
	inviterId: string;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	role: string;
	status: InvitationStatus;
	teamId?: string;
}

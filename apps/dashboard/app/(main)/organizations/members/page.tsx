"use client";

import { useOrganizations } from "@/hooks/use-organizations";
import { MembersPageSkeleton } from "../components/settings-skeletons";
import { InvitationsView } from "./invitations-view";
import { MembersView } from "./members-view";

export default function MembersPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <MembersPageSkeleton />;
	}

	return (
		<div className="mx-auto max-w-4xl space-y-6 p-5">
			<MembersView organization={activeOrganization} />
			<InvitationsView organization={activeOrganization} />
		</div>
	);
}

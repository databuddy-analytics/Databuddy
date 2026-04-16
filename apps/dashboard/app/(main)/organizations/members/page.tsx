"use client";

import { EnvelopeIcon, UsersIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganizations } from "@/hooks/use-organizations";
import {
	InvitationsSkeleton,
	MembersPageSkeleton,
	MembersSkeleton,
} from "../components/settings-skeletons";
import { InvitationsView } from "./invitations-view";
import { MembersView } from "./members-view";

type TabValue = "members" | "invitations";

export default function MembersPage() {
	const { activeOrganization } = useOrganizations();
	const router = useRouter();
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const activeTab: TabValue =
		tabParam === "invitations" ? "invitations" : "members";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (value === "invitations") {
			params.set("tab", "invitations");
		} else {
			params.delete("tab");
		}
		const query = params.toString();
		router.replace(`/organizations/members${query ? `?${query}` : ""}`);
	};

	if (!activeOrganization) {
		return <MembersPageSkeleton />;
	}

	return (
		<Tabs
			className="flex h-full flex-col gap-0"
			onValueChange={handleTabChange}
			value={activeTab}
			variant="navigation"
		>
			<TabsList>
				<TabsTrigger value="members">
					<UsersIcon weight="duotone" />
					Members
				</TabsTrigger>
				<TabsTrigger value="invitations">
					<EnvelopeIcon weight="duotone" />
					Invitations
				</TabsTrigger>
			</TabsList>

			<TabsContent className="m-0 min-h-0 flex-1" value="members">
				<Suspense fallback={<MembersSkeleton />}>
					<MembersView organization={activeOrganization} />
				</Suspense>
			</TabsContent>

			<TabsContent className="m-0 min-h-0 flex-1" value="invitations">
				<Suspense fallback={<InvitationsSkeleton />}>
					<InvitationsView organization={activeOrganization} />
				</Suspense>
			</TabsContent>
		</Tabs>
	);
}

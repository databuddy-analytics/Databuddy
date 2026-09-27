"use client";

import { useParams, useRouter } from "next/navigation";
import { MonitorDetail } from "@/app/(main)/monitors/_components/monitor-detail";

export default function MonitorDetailsPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();

	return (
		<MonitorDetail
			onRemovedAction={() => router.push("/monitors")}
			scheduleId={id}
		/>
	);
}

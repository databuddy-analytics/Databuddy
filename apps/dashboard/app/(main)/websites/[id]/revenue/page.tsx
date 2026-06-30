"use client";

import { useParams } from "next/navigation";
import { RevenueContent } from "./_components/revenue-content";

export default function RevenuePage() {
	const { id: websiteId } = useParams();

	return <RevenueContent websiteId={websiteId as string} />;
}

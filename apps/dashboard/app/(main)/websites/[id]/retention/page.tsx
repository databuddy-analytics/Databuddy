"use client";

import { SpinnerIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const RetentionContentDynamic = dynamic(
	() =>
		import("./_components/retention-content").then((mod) => ({
			default: mod.RetentionContent,
		})),
	{
		loading: () => (
			<div className="flex items-center justify-center p-8">
				<SpinnerIcon className="h-6 w-6 animate-spin" />
			</div>
		),
		ssr: false,
	}
);

export default function RetentionPage() {
	const { id: websiteId } = useParams();

	return (
		<div className="p-6">
			<RetentionContentDynamic websiteId={websiteId as string} />
		</div>
	);
}

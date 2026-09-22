import type React from "react";

export const EmptyState: React.FC<{
	icon: React.ReactNode;
	title: string;
	description: string;
	action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
	<div className="flex h-64 items-center justify-center">
		<div className="flex flex-col items-center justify-center gap-6">
			<div className="flex flex-col items-center justify-center">
				<div className="mx-auto mb-2">{icon}</div>
				<p className="font-medium text-base text-foreground">{title}</p>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			{action}
		</div>
	</div>
);

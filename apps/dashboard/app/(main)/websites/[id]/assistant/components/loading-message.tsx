"use client";

import { RobotIcon } from "@phosphor-icons/react";

export function LoadingMessage() {
	return (
		<div className="flex max-w-[85%] gap-3">
			<div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded bg-muted">
				<RobotIcon className="size-4" />
			</div>
			<div className="mr-2 rounded bg-muted px-4 py-3">
				<div className="flex items-center gap-2 text-sm">
					<div className="flex space-x-1">
						<div className="size-2 rounded bg-current" />
						<div className="size-2 rounded bg-current" />
						<div className="size-2 rounded bg-current" />
					</div>
					<span className="text-muted-foreground">
						Databunny is analyzing...
					</span>
				</div>
			</div>
		</div>
	);
}

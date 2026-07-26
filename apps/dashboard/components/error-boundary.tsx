"use client";

import { trackError } from "@databuddy/sdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, WarningCircleIcon } from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
	const router = useRouter();
	const [hasError, setHasError] = useState(false);

	useEffect(() => {
		const errorHandler = (event: ErrorEvent) => {
			const err = event.error as Error | undefined;
			trackError(err?.message ?? event.message ?? "Unknown error", {
				stack: err?.stack,
				error_type: err?.name,
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			});
			setHasError(true);
		};

		window.addEventListener("error", errorHandler);
		return () => window.removeEventListener("error", errorHandler);
	}, []);

	if (hasError) {
		if (fallback) {
			return <>{fallback}</>;
		}

		const canGoBack =
			typeof window !== "undefined" && window.history.length > 1;

		return (
			<div className="flex h-full min-h-[400px] w-full items-center justify-center p-6">
				<Card className="flex w-full max-w-md flex-col items-center justify-center rounded border-none bg-transparent shadow-none">
					<Card.Content className="flex flex-col items-center justify-center px-6 py-12 text-center sm:px-8 sm:py-14 lg:px-12">
						<div
							aria-hidden="true"
							className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10"
							role="img"
						>
							<WarningCircleIcon
								aria-hidden="true"
								className="size-6 text-destructive"
								size={24}
								weight="fill"
							/>
						</div>

						<div className="mt-6 w-full max-w-sm space-y-4">
							<h1 className="font-semibold text-foreground text-lg">
								Something went wrong
							</h1>
							<p className="text-balance text-muted-foreground text-sm leading-relaxed">
								We encountered an error while trying to display this content.
								This could be due to a temporary issue or a problem with the
								data.
							</p>
						</div>

						<div className="mt-6 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
							{canGoBack && (
								<Button
									className="flex-1"
									onClick={() => router.back()}
									variant="secondary"
								>
									<ArrowLeftIcon className="mr-2 size-4" weight="duotone" />
									Go Back
								</Button>
							)}
							<Button
								className={
									canGoBack
										? "flex-1 bg-primary hover:bg-primary/90"
										: "w-full bg-primary hover:bg-primary/90"
								}
								onClick={() => {
									setHasError(false);
								}}
							>
								Try again
							</Button>
							<Button
								className={canGoBack ? "flex-1" : "w-full"}
								onClick={() => window.location.reload()}
								variant="secondary"
							>
								Reload page
							</Button>
						</div>
					</Card.Content>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}

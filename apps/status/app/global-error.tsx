"use client";

import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Status app global error:", error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					fontFamily:
						'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
					backgroundColor: "#09090b",
					color: "#fafafa",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "100dvh",
				}}
			>
				<div style={{ textAlign: "center", maxWidth: 400, padding: 24 }}>
					<p
						style={{
							fontSize: 11,
							fontWeight: 600,
							textTransform: "uppercase",
							letterSpacing: "0.15em",
							color: "#a78bfa",
							opacity: 0.7,
						}}
					>
						500
					</p>
					<h1 style={{ fontSize: 18, fontWeight: 600, margin: "8px 0" }}>
						Something went wrong
					</h1>
					<p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.6 }}>
						The status page hit an unexpected error.
					</p>
					{error.digest && (
						<p
							style={{
								fontSize: 11,
								fontFamily: "monospace",
								color: "#52525b",
								marginTop: 12,
							}}
						>
							{error.digest}
						</p>
					)}
					<button
						onClick={reset}
						style={{
							marginTop: 24,
							padding: "10px 24px",
							fontSize: 14,
							fontWeight: 600,
							color: "#fafafa",
							backgroundColor: "#7c3aed",
							border: "none",
							borderRadius: 8,
							cursor: "pointer",
						}}
						type="button"
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}

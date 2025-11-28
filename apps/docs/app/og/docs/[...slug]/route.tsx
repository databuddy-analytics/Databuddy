import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getPageImage, source } from "@/lib/source";

export const revalidate = false;

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ slug: string[] }> }
) {
	const { slug } = await params;
	const page = source.getPage(slug.slice(0, -1));

	if (!page) {
		notFound();
	}

	return new ImageResponse(
		<div
			style={{
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "flex-start",
				justifyContent: "flex-end",
				backgroundColor: "#000000",
				padding: "60px 80px",
				position: "relative",
			}}
		>
			{/* Spotlight gradient - matching hero aesthetic */}
			<div
				style={{
					position: "absolute",
					top: "-40%",
					left: "20%",
					width: "800px",
					height: "600px",
					background:
						"radial-gradient(ellipse at center, rgba(255, 255, 255, 0.06), transparent 70%)",
					transform: "rotate(-15deg)",
				}}
			/>

			{/* Secondary subtle glow */}
			<div
				style={{
					position: "absolute",
					top: "0%",
					right: "5%",
					width: "500px",
					height: "400px",
					background:
						"radial-gradient(ellipse at center, rgba(255, 255, 255, 0.03), transparent 60%)",
				}}
			/>

			{/* Subtle grid pattern */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundImage:
						"linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
					backgroundSize: "60px 60px",
				}}
			/>

			{/* Logo and brand */}
			<div
				style={{
					position: "absolute",
					top: "60px",
					left: "80px",
					display: "flex",
					alignItems: "center",
					gap: "16px",
				}}
			>
				{/* Pixel-art D logo - black bg with white D */}
				<svg
					aria-hidden="true"
					height="44"
					style={{ borderRadius: "4px" }}
					viewBox="0 0 8 8"
					width="44"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M0 0h8v8H0z" fill="#000" />
					<path
						d="M1 1h1v6H1zm1 0h4v1H2zm4 1h1v1H6zm0 1h1v1H6zm0 1h1v1H6zm0 1h1v1H6zM2 6h4v1H2zm1-3h1v1H3zm1 1h1v1H4z"
						fill="#fff"
					/>
				</svg>
				<span
					style={{
						color: "#ffffff",
						fontSize: "22px",
						fontWeight: 600,
						fontFamily: "monospace",
						letterSpacing: "0.1em",
						textTransform: "uppercase",
					}}
				>
					Databuddy
				</span>
			</div>

			{/* Documentation badge */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
					marginBottom: "24px",
					padding: "8px 16px",
					backgroundColor: "rgba(255, 255, 255, 0.06)",
					borderRadius: "9999px",
					border: "1px solid rgba(255, 255, 255, 0.1)",
				}}
			>
				<span
					style={{
						color: "#a3a3a3",
						fontSize: "13px",
						fontWeight: 500,
						textTransform: "uppercase",
						letterSpacing: "0.08em",
					}}
				>
					Documentation
				</span>
			</div>

			{/* Title */}
			<h1
				style={{
					color: "#ffffff",
					fontSize: "60px",
					fontWeight: 700,
					lineHeight: 1.1,
					letterSpacing: "-0.03em",
					marginBottom: "16px",
					maxWidth: "900px",
				}}
			>
				{page.data.title}
			</h1>

			{/* Description */}
			{page.data.description && (
				<p
					style={{
						color: "#737373",
						fontSize: "24px",
						lineHeight: 1.5,
						maxWidth: "800px",
					}}
				>
					{page.data.description}
				</p>
			)}

			{/* Bottom bar */}
			<div
				style={{
					position: "absolute",
					bottom: "60px",
					right: "80px",
					display: "flex",
					alignItems: "center",
					gap: "8px",
				}}
			>
				<span
					style={{
						color: "#525252",
						fontSize: "18px",
						fontFamily: "monospace",
					}}
				>
					databuddy.cc/docs
				</span>
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
		}
	);
}

export function generateStaticParams() {
	return source.getPages().map((page) => ({
		slug: getPageImage(page).segments,
	}));
}

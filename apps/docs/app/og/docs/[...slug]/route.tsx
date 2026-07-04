import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { loadOgFonts, OG_COLORS, OgLogo } from "@/lib/og";
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
				backgroundColor: OG_COLORS.background,
				padding: "60px 80px",
				position: "relative",
				fontFamily: "LT Superior",
			}}
		>
			<div
				style={{
					position: "absolute",
					top: "-45%",
					right: "-15%",
					width: "900px",
					height: "700px",
					background: `radial-gradient(ellipse at center, ${OG_COLORS.purpleGlow}, transparent 70%)`,
				}}
			/>

			<div
				style={{
					position: "absolute",
					bottom: "-35%",
					right: "-5%",
					width: "600px",
					height: "500px",
					background: `radial-gradient(ellipse at center, ${OG_COLORS.amberGlow}, transparent 70%)`,
				}}
			/>

			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundImage: `linear-gradient(${OG_COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${OG_COLORS.grid} 1px, transparent 1px)`,
					backgroundSize: "60px 60px",
				}}
			/>

			<div
				style={{
					position: "absolute",
					top: "60px",
					left: "80px",
					display: "flex",
				}}
			>
				<OgLogo height={52} />
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					marginBottom: "24px",
					padding: "8px 16px",
					backgroundColor: OG_COLORS.badgeBackground,
					borderRadius: "9999px",
					border: `1px solid ${OG_COLORS.badgeBorder}`,
				}}
			>
				<span
					style={{
						color: OG_COLORS.muted,
						fontSize: "14px",
						fontWeight: 500,
						textTransform: "uppercase",
						letterSpacing: "0.08em",
					}}
				>
					Documentation
				</span>
			</div>

			<h1
				style={{
					color: OG_COLORS.foreground,
					fontSize: "60px",
					fontWeight: 700,
					lineHeight: 1.1,
					letterSpacing: "-0.02em",
					marginBottom: "16px",
					maxWidth: "900px",
				}}
			>
				{page.data.title}
			</h1>

			{page.data.description && (
				<p
					style={{
						color: OG_COLORS.muted,
						fontSize: "24px",
						lineHeight: 1.5,
						maxWidth: "820px",
					}}
				>
					{page.data.description}
				</p>
			)}

			<div
				style={{
					position: "absolute",
					bottom: "60px",
					right: "80px",
					display: "flex",
				}}
			>
				<span
					style={{
						color: OG_COLORS.faint,
						fontSize: "18px",
						fontWeight: 500,
					}}
				>
					databuddy.cc/docs
				</span>
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			fonts: await loadOgFonts(),
		}
	);
}

export function generateStaticParams() {
	return source.getPages().map((page) => ({
		slug: getPageImage(page).segments,
	}));
}

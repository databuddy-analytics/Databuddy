import { ImageResponse } from "next/og";
import { loadOgFonts, OG_COLORS, OgLogo } from "@/lib/og";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const revenue = searchParams.get("revenue") || "0";
	const visitors = searchParams.get("visitors") || "0";
	const cost = searchParams.get("cost") || "0";

	const revenueNum = Number.parseInt(revenue, 10);
	const visitorsNum = Number.parseInt(visitors, 10);
	const costNum = Number.parseInt(cost, 10);

	const formattedRevenue = `$${revenueNum.toLocaleString("en-US")}`;
	const formattedVisitors = visitorsNum.toLocaleString("en-US");
	const formattedCost = `$${costNum.toLocaleString("en-US")}`;

	return new ImageResponse(
		<div
			style={{
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				backgroundColor: OG_COLORS.background,
				position: "relative",
				overflow: "hidden",
				fontFamily: "LT Superior",
			}}
		>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundImage: `linear-gradient(${OG_COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${OG_COLORS.grid} 1px, transparent 1px)`,
					backgroundSize: "48px 48px",
				}}
			/>

			<div
				style={{
					position: "absolute",
					top: "-25%",
					right: "-10%",
					width: "700px",
					height: "550px",
					background: `radial-gradient(ellipse at center, ${OG_COLORS.purpleGlow}, transparent 70%)`,
				}}
			/>

			<div
				style={{
					position: "absolute",
					bottom: "-30%",
					left: "-10%",
					width: "600px",
					height: "500px",
					background: `radial-gradient(ellipse at center, ${OG_COLORS.amberGlow}, transparent 70%)`,
				}}
			/>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "40px 60px 0",
				}}
			>
				<OgLogo height={40} />
				<span
					style={{
						color: OG_COLORS.faint,
						fontSize: "15px",
						fontWeight: 500,
						letterSpacing: "0.05em",
					}}
				>
					Cookie Banner Cost Calculator
				</span>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					flex: 1,
					padding: "0 60px",
					gap: "32px",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<span
						style={{
							color: OG_COLORS.muted,
							fontSize: "16px",
							fontWeight: 500,
							textTransform: "uppercase",
							letterSpacing: "0.15em",
						}}
					>
						Estimated Opportunity Cost / Year
					</span>
					<span
						style={{
							color: OG_COLORS.amber,
							fontSize: "96px",
							fontWeight: 700,
							letterSpacing: "-0.04em",
							lineHeight: 1,
						}}
					>
						{formattedRevenue}
					</span>
				</div>

				<div
					style={{
						display: "flex",
						gap: "48px",
						alignItems: "center",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "4px",
						}}
					>
						<span
							style={{
								color: OG_COLORS.faint,
								fontSize: "13px",
								fontWeight: 500,
								textTransform: "uppercase",
								letterSpacing: "0.1em",
							}}
						>
							Monthly Visitors
						</span>
						<span
							style={{
								color: OG_COLORS.foreground,
								fontSize: "28px",
								fontWeight: 700,
							}}
						>
							{formattedVisitors}
						</span>
					</div>
					<div
						style={{
							width: "1px",
							height: "40px",
							backgroundColor: OG_COLORS.badgeBorder,
						}}
					/>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "4px",
						}}
					>
						<span
							style={{
								color: OG_COLORS.faint,
								fontSize: "13px",
								fontWeight: 500,
								textTransform: "uppercase",
								letterSpacing: "0.1em",
							}}
						>
							Databuddy (est.)
						</span>
						<span
							style={{
								color: OG_COLORS.foreground,
								fontSize: "28px",
								fontWeight: 700,
							}}
						>
							{formattedCost}/mo
						</span>
					</div>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "0 60px 40px",
				}}
			>
				<span
					style={{
						color: OG_COLORS.faint,
						fontSize: "18px",
						fontWeight: 500,
					}}
				>
					Model yours at databuddy.cc/calculator
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

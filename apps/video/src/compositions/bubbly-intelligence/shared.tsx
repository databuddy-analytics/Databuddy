import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { databuddyFontFamily } from "../../fonts";

export const bubbleColors = {
	amber: "#E3A514",
	coral: "#B74677",
	cream: "#F4EEDC",
	ink: "#18181C",
	mint: "#38D996",
	offWhite: "#E7E8EB",
	purple: "#453C7C",
	softInk: "#27282D",
} as const;

const popConfig = {
	damping: 12,
	mass: 0.62,
	stiffness: 220,
};

export const easeSnap = Easing.bezier(0.16, 1, 0.3, 1);

export function popIn(frame: number, fps: number, from = 0) {
	return spring({
		config: popConfig,
		fps,
		frame: Math.max(0, frame - from),
	});
}

export function BubblyCanvas({
	background,
	children,
	gradient = "none",
	grid = true,
}: PropsWithChildren<{
	background: string;
	gradient?: "one" | "two" | "none";
	grid?: boolean;
}>) {
	const frame = useCurrentFrame();

	return (
		<AbsoluteFill
			style={{
				backgroundColor: background,
				color: bubbleColors.offWhite,
				fontFamily: databuddyFontFamily,
				overflow: "hidden",
			}}
		>
			{gradient === "none" ? null : (
				<Img
					src={staticFile(
						gradient === "one" ? "gradient-bg-1.webp" : "gradient-bg-2.webp"
					)}
					style={{
						height: "118%",
						left: "-9%",
						opacity: 0.86,
						position: "absolute",
						scale: interpolate(frame, [0, 120], [1.04, 1.14], {
							extrapolateLeft: "clamp",
							extrapolateRight: "clamp",
						}),
						top: "-9%",
						translate: `${interpolate(frame, [0, 120], [-18, 24], {
							extrapolateLeft: "clamp",
							extrapolateRight: "clamp",
						})}px ${interpolate(frame, [0, 120], [-12, 16], {
							extrapolateLeft: "clamp",
							extrapolateRight: "clamp",
						})}px`,
						width: "118%",
					}}
				/>
			)}
			{grid ? (
				<AbsoluteFill
					style={{
						backgroundImage:
							"linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
						backgroundSize: "48px 48px",
						opacity: 0.26,
					}}
				/>
			) : null}
			{children}
		</AbsoluteFill>
	);
}

export function Bubble({
	color,
	from = 0,
	label,
	phase = 0,
	size,
	style,
	textColor = bubbleColors.ink,
}: {
	color: string;
	from?: number;
	label?: ReactNode;
	phase?: number;
	size: number;
	style: CSSProperties;
	textColor?: string;
}) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const progress = popIn(frame, fps, from);
	const wobble = Math.sin((frame + phase) / 7) * 3;

	return (
		<div
			style={{
				alignItems: "center",
				background: `radial-gradient(circle at 31% 22%, rgba(255,255,255,0.88) 0 4%, ${color} 32%, ${color} 66%, #18181c 118%)`,
				border: "2px solid rgba(255,255,255,0.28)",
				borderRadius: "52% 48% 47% 53% / 45% 48% 52% 55%",
				boxShadow: `inset 12px 13px 20px rgba(255,255,255,0.18), inset -18px -20px 30px rgba(0,0,0,0.2), 0 20px 40px ${color}66`,
				color: textColor,
				display: "flex",
				fontSize: Math.max(24, size * 0.13),
				fontWeight: 700,
				height: size,
				justifyContent: "center",
				letterSpacing: "-0.04em",
				lineHeight: 0.9,
				opacity: interpolate(progress, [0, 0.12, 1], [0, 1, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				position: "absolute",
				scale: interpolate(progress, [0, 0.7, 1], [0, 1.15, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				textAlign: "center",
				translate: `0 ${wobble}px`,
				width: size,
				...style,
			}}
		>
			{label}
		</div>
	);
}

export function BubblePill({
	accent,
	children,
	from = 0,
	style,
}: PropsWithChildren<{
	accent: string;
	from?: number;
	style?: CSSProperties;
}>) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const progress = popIn(frame, fps, from);

	return (
		<div
			style={{
				alignItems: "center",
				backgroundColor: `${accent}24`,
				border: `2px solid ${accent}`,
				borderRadius: 999,
				boxShadow: `0 12px 24px ${accent}28`,
				color: accent,
				display: "inline-flex",
				fontSize: 27,
				fontWeight: 700,
				justifyContent: "center",
				letterSpacing: "-0.03em",
				opacity: interpolate(progress, [0, 0.12, 1], [0, 1, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				padding: "15px 24px 16px",
				position: "absolute",
				scale: interpolate(progress, [0, 0.7, 1], [0, 1.14, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				...style,
			}}
		>
			{children}
		</div>
	);
}

export function KineticText({
	children,
	color = bubbleColors.offWhite,
	from = 0,
	fontSize,
	style,
}: PropsWithChildren<{
	color?: string;
	from?: number;
	fontSize: number;
	style?: CSSProperties;
}>) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const progress = popIn(frame, fps, from);

	return (
		<div
			style={{
				color,
				fontSize,
				fontWeight: 700,
				letterSpacing: "-0.08em",
				lineHeight: 0.84,
				margin: 0,
				opacity: interpolate(progress, [0, 0.12, 1], [0, 1, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				position: "absolute",
				scale: interpolate(progress, [0, 0.68, 1], [0.62, 1.11, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				transformOrigin: "left center",
				...style,
			}}
		>
			{children}
		</div>
	);
}

export function PixelBunny({
	from = 0,
	style,
}: {
	from?: number;
	style?: CSSProperties;
}) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const progress = popIn(frame, fps, from);

	return (
		<Img
			src={staticFile("bunny-off-white.svg")}
			style={{
				filter: "drop-shadow(0 16px 16px rgba(0,0,0,0.24))",
				opacity: interpolate(progress, [0, 0.1, 1], [0, 1, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				position: "absolute",
				scale: interpolate(progress, [0, 0.68, 1], [0.2, 1.22, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				}),
				...style,
			}}
		/>
	);
}

export function BrandLockup({ style }: { style?: CSSProperties }) {
	return (
		<Img
			src={staticFile("primary-logo-white.svg")}
			style={{ height: "auto", position: "absolute", width: 255, ...style }}
		/>
	);
}

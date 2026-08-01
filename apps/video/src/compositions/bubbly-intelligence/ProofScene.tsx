import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
} from "./shared";

export function ProofScene() {
	const frame = useCurrentFrame();

	return (
		<BubblyCanvas background={bubbleColors.coral} grid={false}>
			<Bubble
				color={bubbleColors.amber}
				from={0}
				phase={3}
				size={510}
				style={{ bottom: -248, left: -150 }}
			/>
			<KineticText
				color={bubbleColors.cream}
				fontSize={154}
				from={0}
				style={{ left: 90, top: 104 }}
			>
				THE RECEIPTS.
			</KineticText>
			<div
				style={{
					backgroundColor: bubbleColors.ink,
					border: `10px solid ${bubbleColors.cream}`,
					borderRadius: 999,
					boxShadow: "0 32px 72px rgba(24,24,28,0.38)",
					height: 640,
					overflow: "hidden",
					position: "absolute",
					right: 138,
					scale: interpolate(frame, [0, 16], [0.46, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
					top: 252,
					width: 640,
				}}
			>
				<Img
					src={staticFile("dashboard-home-insights.png")}
					style={{
						height: "auto",
						left: -692,
						position: "absolute",
						top: -156,
						width: 1600,
					}}
				/>
				<div
					style={{
						border: `5px solid ${bubbleColors.coral}`,
						borderRadius: 22,
						height: 125,
						left: 84,
						position: "absolute",
						top: 186,
						width: 472,
					}}
				/>
			</div>
			<BubblePill
				accent={bubbleColors.cream}
				from={12}
				style={{ bottom: 136, left: 96 }}
			>
				Evidence-backed
			</BubblePill>
		</BubblyCanvas>
	);
}

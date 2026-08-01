import { interpolate, useCurrentFrame } from "remotion";
import {
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
	PixelBunny,
} from "./shared";

const milestones = ["new evidence", "reply", "recheck", "resolved"];

export function InvestigationScene() {
	const frame = useCurrentFrame();

	return (
		<BubblyCanvas background={bubbleColors.ink} gradient="one">
			<Bubble
				color={bubbleColors.purple}
				from={0}
				phase={4}
				size={640}
				style={{ right: -80, top: -148 }}
			/>
			<BubblePill
				accent={bubbleColors.coral}
				from={3}
				style={{ left: 94, top: 92 }}
			>
				WORTH ACTING ON?
			</BubblePill>
			<KineticText fontSize={122} from={9} style={{ left: 88, top: 204 }}>
				MAKE IT AN
			</KineticText>
			<KineticText
				color={bubbleColors.amber}
				fontSize={122}
				from={15}
				style={{ left: 88, top: 306 }}
			>
				INVESTIGATION.
			</KineticText>
			<div
				style={{
					alignItems: "center",
					bottom: 144,
					display: "flex",
					gap: 14,
					left: 94,
					position: "absolute",
				}}
			>
				{milestones.map((milestone, index) => (
					<div
						key={milestone}
						style={{ alignItems: "center", display: "flex", gap: 14 }}
					>
						<BubblePill
							accent={
								index === milestones.length - 1
									? bubbleColors.mint
									: bubbleColors.offWhite
							}
							from={24 + index * 8}
							style={{ position: "relative" }}
						>
							{milestone}
						</BubblePill>
						{index < milestones.length - 1 ? (
							<div
								style={{
									backgroundColor: bubbleColors.coral,
									height: 4,
									width: interpolate(
										frame,
										[30 + index * 8, 39 + index * 8],
										[0, 48],
										{
											extrapolateLeft: "clamp",
											extrapolateRight: "clamp",
										}
									),
								}}
							/>
						) : null}
					</div>
				))}
			</div>
			<PixelBunny
				from={38}
				style={{
					bottom: 240,
					right: 192,
					translate: `0 ${Math.sin(frame / 5) * 10}px`,
					width: 176,
				}}
			/>
		</BubblyCanvas>
	);
}

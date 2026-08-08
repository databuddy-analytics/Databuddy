import { interpolate, useCurrentFrame } from "remotion";
import { Bubble, BubblyCanvas, bubbleColors, KineticText } from "./shared";

const promises = [
	{ color: bubbleColors.cream, from: 0, text: "WHAT CHANGED." },
	{ color: bubbleColors.amber, from: 17, text: "WHY IT MATTERS." },
	{ color: bubbleColors.mint, from: 34, text: "WHAT NEXT." },
];

export function PromiseScene() {
	const frame = useCurrentFrame();

	return (
		<BubblyCanvas background={bubbleColors.ink} gradient="two">
			{promises.map((promise, index) => (
				<KineticText
					color={promise.color}
					fontSize={132}
					from={promise.from}
					key={promise.text}
					style={{
						left: 96,
						top: 148 + index * 220,
						translate: `0 ${interpolate(
							frame,
							[promise.from + 13, promise.from + 24, 62],
							[0, 0, -index * 38],
							{
								extrapolateLeft: "clamp",
								extrapolateRight: "clamp",
							}
						)}px`,
					}}
				>
					{promise.text}
				</KineticText>
			))}
			<Bubble
				color={bubbleColors.coral}
				from={12}
				phase={6}
				size={174}
				style={{ right: 138, top: 132 }}
			/>
			<Bubble
				color={bubbleColors.amber}
				from={27}
				phase={1}
				size={320}
				style={{ bottom: -120, right: 158 }}
			/>
		</BubblyCanvas>
	);
}

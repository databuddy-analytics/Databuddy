import {
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
	PixelBunny,
} from "./shared";

export function InsightScene() {
	return (
		<BubblyCanvas background={bubbleColors.cream} grid={false}>
			<Bubble
				color={bubbleColors.coral}
				from={0}
				phase={3}
				size={210}
				style={{ left: -72, top: -56 }}
			/>
			<Bubble
				color={bubbleColors.mint}
				from={6}
				phase={9}
				size={138}
				style={{ right: 102, top: 90 }}
			/>
			<KineticText
				color={bubbleColors.ink}
				fontSize={126}
				from={2}
				style={{ left: 92, top: 88 }}
			>
				WORTH
			</KineticText>
			<KineticText
				color={bubbleColors.ink}
				fontSize={126}
				from={8}
				style={{ left: 92, top: 192 }}
			>
				KNOWING.
			</KineticText>
			<div
				style={{
					backgroundColor: bubbleColors.ink,
					borderRadius: 42,
					boxShadow: "0 26px 70px rgba(24,24,28,0.28)",
					height: 402,
					left: 92,
					overflow: "hidden",
					position: "absolute",
					top: 388,
					width: 1160,
				}}
			>
				<BubblePill
					accent={bubbleColors.amber}
					from={14}
					style={{ left: 40, top: 38 }}
				>
					INSIGHT
				</BubblePill>
				<KineticText
					color={bubbleColors.offWhite}
					fontSize={76}
					from={19}
					style={{ left: 42, top: 132 }}
				>
					ONBOARDING
					<br />
					SLIPPED AT STEP 2.
				</KineticText>
				<BubblePill
					accent={bubbleColors.mint}
					from={31}
					style={{ bottom: 38, left: 42 }}
				>
					Impact
				</BubblePill>
				<BubblePill
					accent={bubbleColors.coral}
					from={36}
					style={{ bottom: 38, left: 226 }}
				>
					Evidence
				</BubblePill>
				<BubblePill
					accent={bubbleColors.amber}
					from={41}
					style={{ bottom: 38, left: 440 }}
				>
					Known cause*
				</BubblePill>
			</div>
			<PixelBunny from={28} style={{ bottom: 72, right: 124, width: 210 }} />
			<BubblePill
				accent={bubbleColors.purple}
				from={47}
				style={{ bottom: 138, right: 96 }}
			>
				*when there is one
			</BubblePill>
		</BubblyCanvas>
	);
}

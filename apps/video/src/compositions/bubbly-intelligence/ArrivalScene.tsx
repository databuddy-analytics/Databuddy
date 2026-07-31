import {
	BrandLockup,
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
	PixelBunny,
} from "./shared";

export function ArrivalScene() {
	return (
		<BubblyCanvas background={bubbleColors.ink} gradient="one">
			<Bubble
				color={bubbleColors.amber}
				from={0}
				phase={0}
				size={180}
				style={{ bottom: -48, left: -28 }}
			/>
			<Bubble
				color={bubbleColors.coral}
				from={6}
				phase={3}
				size={104}
				style={{ bottom: 76, left: 128 }}
			/>
			<Bubble
				color={bubbleColors.mint}
				from={10}
				phase={6}
				size={72}
				style={{ bottom: 65, left: 258 }}
			/>
			<BrandLockup style={{ left: 96, top: 74 }} />
			<BubblePill
				accent={bubbleColors.amber}
				from={7}
				style={{ left: 96, top: 212 }}
			>
				NEW
			</BubblePill>
			<KineticText fontSize={174} from={12} style={{ left: 90, top: 300 }}>
				MEET
			</KineticText>
			<KineticText
				color={bubbleColors.cream}
				fontSize={174}
				from={21}
				style={{ left: 90, top: 448 }}
			>
				INTELLIGENCE.
			</KineticText>
			<PixelBunny from={18} style={{ bottom: 86, right: 138, width: 240 }} />
		</BubblyCanvas>
	);
}

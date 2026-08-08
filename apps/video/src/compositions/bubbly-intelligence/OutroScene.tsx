import {
	BrandLockup,
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
	PixelBunny,
} from "./shared";

export function OutroScene() {
	return (
		<BubblyCanvas background={bubbleColors.ink} gradient="one">
			<Bubble
				color={bubbleColors.amber}
				from={0}
				phase={2}
				size={430}
				style={{ bottom: -170, left: -100 }}
			/>
			<Bubble
				color={bubbleColors.coral}
				from={6}
				phase={9}
				size={210}
				style={{ right: 160, top: 100 }}
			/>
			<BrandLockup style={{ left: 94, top: 80 }} />
			<KineticText fontSize={132} from={7} style={{ left: 92, top: 260 }}>
				DATABUDDY
			</KineticText>
			<KineticText
				color={bubbleColors.cream}
				fontSize={132}
				from={13}
				style={{ left: 92, top: 372 }}
			>
				INTELLIGENCE.
			</KineticText>
			<BubblePill
				accent={bubbleColors.amber}
				from={24}
				style={{ bottom: 174, left: 96 }}
			>
				powered by Databunny
			</BubblePill>
			<BubblePill
				accent={bubbleColors.offWhite}
				from={31}
				style={{ bottom: 100, left: 96 }}
			>
				databuddy.cc
			</BubblePill>
			<PixelBunny from={18} style={{ bottom: 102, right: 170, width: 250 }} />
		</BubblyCanvas>
	);
}

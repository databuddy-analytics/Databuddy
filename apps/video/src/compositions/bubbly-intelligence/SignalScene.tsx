import {
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
} from "./shared";

export function SignalScene() {
	return (
		<BubblyCanvas background={bubbleColors.purple} gradient="none">
			<Bubble
				color={bubbleColors.amber}
				from={0}
				label={<>SIGNAL</>}
				phase={1}
				size={570}
				style={{ left: 1014, top: 250 }}
				textColor={bubbleColors.ink}
			/>
			<Bubble
				color={bubbleColors.mint}
				from={5}
				phase={8}
				size={126}
				style={{ left: 910, top: 134 }}
			/>
			<Bubble
				color={bubbleColors.coral}
				from={10}
				phase={4}
				size={178}
				style={{ bottom: 90, left: 870 }}
			/>
			<BubblePill
				accent={bubbleColors.cream}
				from={3}
				style={{ left: 100, top: 146 }}
			>
				NOISE OUT
			</BubblePill>
			<KineticText
				color={bubbleColors.cream}
				fontSize={152}
				from={9}
				style={{ left: 92, top: 270 }}
			>
				FIND THE
			</KineticText>
			<KineticText fontSize={186} from={16} style={{ left: 90, top: 398 }}>
				SIGNAL.
			</KineticText>
			<BubblePill
				accent={bubbleColors.cream}
				from={25}
				style={{ bottom: 128, left: 102 }}
			>
				meaningful change
			</BubblePill>
		</BubblyCanvas>
	);
}

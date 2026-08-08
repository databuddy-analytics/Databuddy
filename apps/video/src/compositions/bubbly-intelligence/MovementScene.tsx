import {
	Bubble,
	BubblePill,
	BubblyCanvas,
	bubbleColors,
	KineticText,
} from "./shared";

export function MovementScene() {
	return (
		<BubblyCanvas background={bubbleColors.ink} gradient="two">
			<KineticText fontSize={156} from={0} style={{ left: 90, top: 104 }}>
				YOUR PRODUCT
			</KineticText>
			<KineticText
				color={bubbleColors.cream}
				fontSize={204}
				from={7}
				style={{ left: 90, top: 240 }}
			>
				MOVES.
			</KineticText>
			<BubblePill
				accent={bubbleColors.amber}
				from={10}
				style={{ left: 102, top: 530 }}
			>
				Traffic
			</BubblePill>
			<BubblePill
				accent={bubbleColors.coral}
				from={16}
				style={{ left: 310, top: 648 }}
			>
				Funnels
			</BubblePill>
			<BubblePill
				accent={bubbleColors.mint}
				from={22}
				style={{ left: 528, top: 530 }}
			>
				Errors
			</BubblePill>
			<BubblePill
				accent={bubbleColors.offWhite}
				from={28}
				style={{ left: 741, top: 652 }}
			>
				Goals
			</BubblePill>
			<Bubble
				color={bubbleColors.purple}
				from={18}
				phase={8}
				size={510}
				style={{ bottom: -110, right: -36 }}
			/>
			<Bubble
				color={bubbleColors.coral}
				from={31}
				phase={4}
				size={210}
				style={{ bottom: 170, right: 394 }}
			/>
		</BubblyCanvas>
	);
}

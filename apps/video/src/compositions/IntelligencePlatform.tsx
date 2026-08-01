import { Audio } from "@remotion/media";
import { interpolate, Series, staticFile } from "remotion";
import { ArrivalScene } from "./bubbly-intelligence/ArrivalScene";
import { InsightScene } from "./bubbly-intelligence/InsightScene";
import { InvestigationScene } from "./bubbly-intelligence/InvestigationScene";
import { MovementScene } from "./bubbly-intelligence/MovementScene";
import { OutroScene } from "./bubbly-intelligence/OutroScene";
import { PromiseScene } from "./bubbly-intelligence/PromiseScene";
import { ProofScene } from "./bubbly-intelligence/ProofScene";
import { SignalScene } from "./bubbly-intelligence/SignalScene";

export const intelligencePlatformDurationInFrames = 480;

export function IntelligencePlatform() {
	return (
		<>
			<Audio
				src={staticFile("intelligence-launch.m4a")}
				volume={(frame) =>
					interpolate(frame, [0, 12, 444, 480], [0, 0.94, 0.94, 0], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					})
				}
			/>
			<Series>
				<Series.Sequence durationInFrames={45} name="Arrival">
					<ArrivalScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={54} name="Product movement">
					<MovementScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={51} name="Signal">
					<SignalScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={75} name="Insight">
					<InsightScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={84} name="Investigation">
					<InvestigationScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={36} name="Product proof">
					<ProofScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={63} name="Promise">
					<PromiseScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={72} name="Outro">
					<OutroScene />
				</Series.Sequence>
			</Series>
		</>
	);
}

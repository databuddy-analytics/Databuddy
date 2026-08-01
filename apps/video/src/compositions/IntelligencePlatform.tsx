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

export const intelligencePlatformCompositionId = "IntelligencePlatform";

export const intelligenceSceneTimeline = [
	{
		component: ArrivalScene,
		durationInFrames: 45,
		id: "Intelligence-Arrival",
		name: "Arrival",
	},
	{
		component: MovementScene,
		durationInFrames: 54,
		id: "Intelligence-Movement",
		name: "Product movement",
	},
	{
		component: SignalScene,
		durationInFrames: 51,
		id: "Intelligence-Signal",
		name: "Signal",
	},
	{
		component: InsightScene,
		durationInFrames: 75,
		id: "Intelligence-Insight",
		name: "Insight",
	},
	{
		component: InvestigationScene,
		durationInFrames: 84,
		id: "Intelligence-Investigation",
		name: "Investigation",
	},
	{
		component: ProofScene,
		durationInFrames: 36,
		id: "Intelligence-Proof",
		name: "Product proof",
	},
	{
		component: PromiseScene,
		durationInFrames: 63,
		id: "Intelligence-Promise",
		name: "Promise",
	},
	{
		component: OutroScene,
		durationInFrames: 72,
		id: "Intelligence-Outro",
		name: "Outro",
	},
] as const;

export const intelligencePlatformDurationInFrames =
	intelligenceSceneTimeline.reduce(
		(total, scene) => total + scene.durationInFrames,
		0
	);

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
				{intelligenceSceneTimeline.map((scene) => {
					const Scene = scene.component;
					return (
						<Series.Sequence
							durationInFrames={scene.durationInFrames}
							key={scene.id}
							name={scene.name}
						>
							<Scene />
						</Series.Sequence>
					);
				})}
			</Series>
		</>
	);
}

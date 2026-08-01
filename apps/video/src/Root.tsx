import "./index.css";
import "./fonts";
import { Composition, Folder } from "remotion";
import {
	intelligencePlatformDurationInFrames,
	IntelligencePlatform,
} from "./compositions/IntelligencePlatform";
import { ArrivalScene } from "./compositions/bubbly-intelligence/ArrivalScene";
import { InsightScene } from "./compositions/bubbly-intelligence/InsightScene";
import { InvestigationScene } from "./compositions/bubbly-intelligence/InvestigationScene";
import { MovementScene } from "./compositions/bubbly-intelligence/MovementScene";
import { OutroScene } from "./compositions/bubbly-intelligence/OutroScene";
import { PromiseScene } from "./compositions/bubbly-intelligence/PromiseScene";
import { ProofScene } from "./compositions/bubbly-intelligence/ProofScene";
import { SignalScene } from "./compositions/bubbly-intelligence/SignalScene";

export const RemotionRoot: React.FC = () => (
	<>
		<Folder name="Bubbly-intelligence-release-scenes">
			<Composition
				component={ArrivalScene}
				durationInFrames={45}
				fps={30}
				height={1080}
				id="Intelligence-Arrival"
				width={1920}
			/>
			<Composition
				component={MovementScene}
				durationInFrames={54}
				fps={30}
				height={1080}
				id="Intelligence-Movement"
				width={1920}
			/>
			<Composition
				component={SignalScene}
				durationInFrames={51}
				fps={30}
				height={1080}
				id="Intelligence-Signal"
				width={1920}
			/>
			<Composition
				component={InsightScene}
				durationInFrames={75}
				fps={30}
				height={1080}
				id="Intelligence-Insight"
				width={1920}
			/>
			<Composition
				component={InvestigationScene}
				durationInFrames={84}
				fps={30}
				height={1080}
				id="Intelligence-Investigation"
				width={1920}
			/>
			<Composition
				component={ProofScene}
				durationInFrames={36}
				fps={30}
				height={1080}
				id="Intelligence-Proof"
				width={1920}
			/>
			<Composition
				component={PromiseScene}
				durationInFrames={63}
				fps={30}
				height={1080}
				id="Intelligence-Promise"
				width={1920}
			/>
			<Composition
				component={OutroScene}
				durationInFrames={72}
				fps={30}
				height={1080}
				id="Intelligence-Outro"
				width={1920}
			/>
		</Folder>
		<Composition
			component={IntelligencePlatform}
			durationInFrames={intelligencePlatformDurationInFrames}
			fps={30}
			height={1080}
			id="IntelligencePlatform"
			width={1920}
		/>
	</>
);

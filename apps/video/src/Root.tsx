import "./index.css";
import "./fonts";
import { Composition, Folder } from "remotion";
import {
	intelligencePlatformCompositionId,
	intelligencePlatformDurationInFrames,
	IntelligencePlatform,
	intelligenceSceneTimeline,
} from "./compositions/IntelligencePlatform";

export const RemotionRoot: React.FC = () => (
	<>
		<Folder name="Bubbly-intelligence-release-scenes">
			{intelligenceSceneTimeline.map((scene) => (
				<Composition
					component={scene.component}
					durationInFrames={scene.durationInFrames}
					fps={30}
					height={1080}
					id={scene.id}
					key={scene.id}
					width={1920}
				/>
			))}
		</Folder>
		<Composition
			component={IntelligencePlatform}
			durationInFrames={intelligencePlatformDurationInFrames}
			fps={30}
			height={1080}
			id={intelligencePlatformCompositionId}
			width={1920}
		/>
	</>
);

import { $ } from "bun";
import { intelligencePlatformCompositionId } from "./compositions/IntelligencePlatform";

await $`remotion render src/index.ts ${intelligencePlatformCompositionId} out/intelligence-platform.mp4`;

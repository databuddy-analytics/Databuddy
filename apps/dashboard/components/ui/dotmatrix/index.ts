export { DotMatrixBase } from "./core";
export type {
	DotAnimationContext,
	DotAnimationResolver,
	DotAnimationState,
	DotMatrixCommonProps,
} from "./core";

export {
	useCyclePhase,
	useDotMatrixPhases,
	usePrefersReducedMotion,
	useSteppedCycle,
} from "./hooks";

export {
	DotMatrixLoader,
	useRandomDotMatrixLoader,
	DOT_MATRIX_LOADER_NAMES,
} from "./loader";
export type { DotMatrixLoaderName, DotMatrixLoaderProps } from "./loader";

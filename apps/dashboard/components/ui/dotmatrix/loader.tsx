"use client";

import { useId, type ComponentType } from "react";
import * as circular from "./variants/circular";
import * as square from "./variants/square";
import * as triangle from "./variants/triangle";
import type { DotMatrixCommonProps } from "./core";
import { cn } from "@/lib/utils";

type DotMatrixComponent = ComponentType<DotMatrixCommonProps>;

const VARIANT_COUNT = 20;
const SHAPES = ["square", "circular", "triangle"] as const;
type Shape = (typeof SHAPES)[number];

const shapeModules: Record<Shape, Record<string, DotMatrixComponent>> = {
	square,
	circular,
	triangle,
};

function buildLoaderName(shape: Shape, n: number) {
	return `dotm-${shape}-${n}` as const;
}

function capitalize(s: string) {
	return s[0]!.toUpperCase() + s.slice(1);
}

export const DOT_MATRIX_LOADER_NAMES = SHAPES.flatMap((shape) =>
	Array.from({ length: VARIANT_COUNT }, (_, i) => buildLoaderName(shape, i + 1))
);

export type DotMatrixLoaderName = `dotm-${Shape}-${number}`;

const DOT_MATRIX_LOADERS = Object.fromEntries(
	SHAPES.flatMap((shape) =>
		Array.from({ length: VARIANT_COUNT }, (_, i) => {
			const n = i + 1;
			const key = buildLoaderName(shape, n);
			const component =
				shapeModules[shape][`Dotm${capitalize(shape)}${n}`] as DotMatrixComponent;
			return [key, component] as const;
		})
	)
) as Record<DotMatrixLoaderName, DotMatrixComponent>;

function hashLoaderSeed(seed: string): number {
	let hash = 5381;
	for (let i = 0; i < seed.length; i += 1) {
		hash = (hash * 33 + seed.charCodeAt(i)) % 2_147_483_647;
	}
	return hash;
}

function pickLoaderName(seed: string): DotMatrixLoaderName {
	const index = hashLoaderSeed(seed) % DOT_MATRIX_LOADER_NAMES.length;
	return DOT_MATRIX_LOADER_NAMES[index] ?? "dotm-square-3";
}

export function useRandomDotMatrixLoader(): DotMatrixLoaderName {
	return pickLoaderName(useId());
}

export type DotMatrixLoaderProps = Omit<
	DotMatrixCommonProps,
	"ariaLabel" | "className"
> & {
	className?: string;
	decorative?: boolean;
	label?: string;
	loader?: DotMatrixLoaderName;
	seed?: string;
};

export function DotMatrixLoader({
	animated = true,
	className,
	decorative = false,
	dotSize = 3,
	label = "Loading",
	loader,
	seed = label,
	size = 18,
	speed = 1.4,
	...props
}: DotMatrixLoaderProps) {
	const loaderName = loader ?? pickLoaderName(seed);
	const Loader = DOT_MATRIX_LOADERS[loaderName];
	const element = (
		<Loader
			animated={animated}
			ariaLabel={label}
			className={cn("shrink-0 text-current", className)}
			dotSize={dotSize}
			size={size}
			speed={speed}
			{...props}
		/>
	);

	if (decorative) {
		return <span aria-hidden="true">{element}</span>;
	}

	return element;
}

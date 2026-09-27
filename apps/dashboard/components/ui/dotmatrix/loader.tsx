"use client";

import { useId } from "react";
import type { DotMatrixCommonProps } from "./core";
import { DotmCircular1, DotmCircular8 } from "./variants/circular";
import { DotmSquare1, DotmSquare3 } from "./variants/square";
import { DotmTriangle1, DotmTriangle7 } from "./variants/triangle";
import { cn } from "@/lib/utils";

const DOT_MATRIX_LOADERS = {
	"dotm-square-1": DotmSquare1,
	"dotm-square-3": DotmSquare3,
	"dotm-circular-1": DotmCircular1,
	"dotm-circular-8": DotmCircular8,
	"dotm-triangle-1": DotmTriangle1,
	"dotm-triangle-7": DotmTriangle7,
};

export type DotMatrixLoaderName = keyof typeof DOT_MATRIX_LOADERS;

const DOT_MATRIX_LOADER_NAMES = Object.keys(
	DOT_MATRIX_LOADERS
) as DotMatrixLoaderName[];

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

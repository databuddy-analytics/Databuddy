"use client";

type UserAvatarProps = {
	visitorId: string;
	size?: "sm" | "md" | "lg";
	className?: string;
};

function hashCode(str: string): number {
	let hash = 5381;
	for (const char of str) {
		hash = Math.imul(hash, 33) + char.charCodeAt(0);
	}
	return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
	const sNorm = s / 100;
	const lNorm = l / 100;
	const a = sNorm * Math.min(lNorm, 1 - lNorm);

	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, "0");
	};

	return `#${f(0)}${f(8)}${f(4)}`;
}

function getGradient(visitorId: string): {
	from: string;
	to: string;
	angle: number;
} {
	const hash1 = hashCode(visitorId);
	const hash2 = hashCode(visitorId.split("").reverse().join(""));
	const hash3 = hashCode(`${visitorId}salt`);

	// Generate base hue from hash (0-360)
	const baseHue = hash1 % 360;

	// Hue shift strategies for nice color combinations
	const hueShifts = [30, 45, 60, 90, 120, 150, 180];
	const hueShift = hueShifts[hash2 % hueShifts.length] ?? 60;

	// Saturation and lightness variations
	const saturations = [65, 70, 75, 80, 85];
	const lightnesses = [55, 60, 65, 70];

	const sat1 = saturations[hash1 % saturations.length] ?? 75;
	const sat2 = saturations[hash2 % saturations.length] ?? 70;
	const light1 = lightnesses[hash2 % lightnesses.length] ?? 60;
	const light2 = lightnesses[hash3 % lightnesses.length] ?? 65;

	const from = hslToHex(baseHue, sat1, light1);
	const to = hslToHex((baseHue + hueShift) % 360, sat2, light2);

	// Angle variation
	const angle = 120 + (hash3 % 60);

	return { from, to, angle };
}

export function UserAvatar({
	visitorId,
	size = "md",
	className,
}: UserAvatarProps) {
	const { from, to, angle } = getGradient(visitorId);

	const sizeClasses = {
		sm: "size-6",
		md: "size-8",
		lg: "size-10",
	};

	const sizeClass = sizeClasses[size];

	return (
		<div
			className={`shrink-0 rounded-full ${sizeClass}${className ? ` ${className}` : ""}`}
			style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}
		/>
	);
}

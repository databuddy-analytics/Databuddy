"use client";

import {
	animate,
	motion,
	useMotionTemplate,
	useMotionValue,
} from "motion/react";
import { useEffect, useRef } from "react";

export function GridBackground() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mouseX = useMotionValue(-999);
	const mouseY = useMotionValue(-999);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const onMouseMove = (e: MouseEvent) => {
			const { left, top, right, bottom } = el.getBoundingClientRect();
			if (
				e.clientX < left ||
				e.clientX > right ||
				e.clientY < top ||
				e.clientY > bottom
			) {
				animate(mouseX, -999, { type: "spring", stiffness: 100, damping: 30 });
				animate(mouseY, -999, { type: "spring", stiffness: 100, damping: 30 });
			} else {
				animate(mouseX, e.clientX - left, {
					type: "spring",
					stiffness: 150,
					damping: 25,
				});
				animate(mouseY, e.clientY - top, {
					type: "spring",
					stiffness: 150,
					damping: 25,
				});
			}
		};

		const onMouseLeave = () => {
			animate(mouseX, -999, { type: "spring", stiffness: 100, damping: 30 });
			animate(mouseY, -999, { type: "spring", stiffness: 100, damping: 30 });
		};

		window.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseleave", onMouseLeave);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseleave", onMouseLeave);
		};
	}, [mouseX, mouseY]);

	// Base grid — always visible, low opacity
	const baseGridStyle = {
		backgroundImage: `
      linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)
    `,
		backgroundSize: "80px 80px",
	};

	return (
		<div
			aria-hidden
			className="absolute inset-0 overflow-hidden"
			ref={containerRef}
		>
			{/* Base grid — always visible */}
			<div className="absolute inset-0" style={baseGridStyle} />

			{/* Colored grid — revealed under cursor via SVG mask */}
			<svg className="absolute inset-0 h-full w-full">
				<defs>
					{/* Diagonal gradient spanning the full canvas */}
					<linearGradient id="line-color" x1="0%" x2="100%" y1="0%" y2="100%">
						<stop offset="0%" stopColor="var(--brand-amber)" />
						<stop offset="50%" stopColor="var(--brand-purple)" />
						<stop offset="100%" stopColor="var(--brand-coral)" />
					</linearGradient>

					{/* Grid lines mask: white on lines, black on gaps */}
					<pattern
						height="80"
						id="grid-lines-pattern"
						patternUnits="userSpaceOnUse"
						width="80"
					>
						<rect fill="black" height="80" width="80" />
						<rect fill="white" height="80" width="1" x="79" y="0" />
						<rect fill="white" height="1" width="80" x="0" y="79" />
					</pattern>
					<mask id="grid-lines-mask">
						<rect fill="url(#grid-lines-pattern)" height="100%" width="100%" />
					</mask>

					{/* Cursor reveal */}
					<motion.radialGradient
						cx={useMotionTemplate`${mouseX}px`}
						cy={useMotionTemplate`${mouseY}px`}
						gradientUnits="userSpaceOnUse"
						id="grid-reveal"
						r="200"
					>
						<stop offset="0%" stopColor="white" stopOpacity="1" />
						<stop offset="100%" stopColor="white" stopOpacity="0" />
					</motion.radialGradient>
					<mask id="cursor-mask">
						<rect fill="url(#grid-reveal)" height="100%" width="100%" />
					</mask>
				</defs>

				{/* Gradient rect → masked to grid lines → masked to cursor area */}
				<g mask="url(#cursor-mask)">
					<rect
						fill="url(#line-color)"
						height="100%"
						mask="url(#grid-lines-mask)"
						width="100%"
					/>
				</g>
			</svg>

			{/* Left fade — keeps text readable */}
			<div
				className="absolute inset-0"
				style={{
					background: "linear-gradient(to right, #1a1a1f 0%, transparent 50%)",
				}}
			/>
		</div>
	);
}

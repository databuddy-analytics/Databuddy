const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function Gradient() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			{/* Stacked arcs anchored at bottom-right */}
			<div
				className="absolute inset-0"
				style={{
					background: `
                    radial-gradient(ellipse 160%  98%  at 100% 120%, var(--brand-amber) 30%, transparent 80%),
                    radial-gradient(ellipse 171% 103%  at 100% 120%, #C86020 50%, transparent 80%),
                    radial-gradient(ellipse 183% 109%  at 100% 120%, var(--brand-coral) 50%, transparent 80%),
                    radial-gradient(ellipse 196% 116%  at 100% 120%, #5C3A90 50%, transparent 80%),
                    radial-gradient(ellipse 210% 124%  at 100% 120%, var(--brand-purple) 50%, transparent 80%),
                    radial-gradient(ellipse 225% 133%  at 100% 120%, #16163C 50%, transparent 80%),
                    #1a1a1f
                    `,
					maskImage:
						"linear-gradient(to bottom, black 0%, black 50%, transparent 75%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, black 0%, black 50%, transparent 75%)",
				}}
			/>

			{/* Grain.  */}
			<div
				className="absolute inset-0 opacity-[0.00]"
				style={{
					backgroundImage: NOISE,
					backgroundRepeat: "repeat",
					backgroundSize: "256px 256px",
				}}
			/>
		</div>
	);
}

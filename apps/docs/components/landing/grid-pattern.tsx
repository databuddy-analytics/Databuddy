export const GridPatternBg = () => {
	return (
		<div className="relative min-h-screen w-full text-foreground/80">
			<div
				className="absolute inset-0 z-[1]"
				style={{
					background:
						'radial-gradient(ellipse 40% 16% at 50% 15%, var(--ring) 0%, transparent 70%)',
					filter: 'blur(20px)',
					opacity: 0.15,
				}}
			/>
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: `
					linear-gradient(to right, var(--border) 1px, transparent 1px),
					linear-gradient(to bottom, var(--border) 1px, transparent 1px)
					`,
					backgroundSize: '30px 30px',
					maskImage:
						'radial-gradient(ellipse 40% 16% at 50% 15%, black 0%, black 40%, transparent 100%)',
					WebkitMaskImage:
						'radial-gradient(ellipse 40% 16% at 50% 15%, black 0%, black 40%, transparent 100%)',
					opacity: 0.3,
				}}
			/>
		</div>
	);
};

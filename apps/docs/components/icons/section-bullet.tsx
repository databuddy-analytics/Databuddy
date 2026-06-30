interface SectionBulletProps {
	color: string;
}

export function SectionBullet({ color }: SectionBulletProps) {
	return (
		<div>
			<svg
				aria-hidden="true"
				className="h-6 w-5 sm:h-7 sm:w-6 md:h-8 md:w-7"
				fill="none"
				viewBox="0 0 26 34"
				xmlns="http://www.w3.org/2000/svg"
			>
				<rect fill={color} height="7" width="18" />
				<rect
					fill={color}
					height="7"
					opacity="0.72"
					width="18"
					x="8"
					y="13.5"
				/>
				<rect fill={color} height="7" width="18" y="27" />
			</svg>
		</div>
	);
}

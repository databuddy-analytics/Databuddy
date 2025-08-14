import { cn } from '@/lib/utils';

type SpotlightProps = {
	className?: string;
	fill?: string;
	top?: string;
	left?: string;
	transform?: string;
};

export const Spotlight = ({
	className,
	fill,
	top,
	left,
	transform,
}: SpotlightProps) => {
	return (
		<svg
			className={cn(
				'pointer-events-none absolute z-[1] h-[169%] w-[138%] lg:w-[84%]',
				className
			)}
			fill="none"
			style={{ top, left, transform }}
			viewBox="0 0 3787 2842"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Decorative spotlight</title>
			<g filter="url(#filter)">
				<ellipse
					cx="1924.71"
					cy="273.501"
					fill={fill || 'currentColor'}
					fillOpacity="0.08"
					rx="1924.71"
					ry="273.501"
					transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
				/>
			</g>
			<defs>
				<filter
					colorInterpolationFilters="sRGB"
					filterUnits="userSpaceOnUse"
					height="2840.26"
					id="filter"
					width="3785.16"
					x="0.860352"
					y="0.838989"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feBlend
						in="SourceGraphic"
						in2="BackgroundImageFix"
						mode="normal"
						result="shape"
					/>
					<feGaussianBlur
						result="effect1_foregroundBlur_1065_8"
						stdDeviation="180"
					/>
				</filter>
			</defs>
		</svg>
	);
};

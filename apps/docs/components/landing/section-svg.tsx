const SectionSvg = ({ crossesOffset }: { crossesOffset?: string }) => {
	return (
		<>
			<PlusSvg
				className={`-top-[0.3125rem] absolute hidden ${
					crossesOffset && crossesOffset
				} pointer-events-none lg:left-[3.6825rem] lg:block`}
			/>

			<PlusSvg
				className={`-top-[0.3125rem] absolute right-[1.4625rem] hidden ${
					crossesOffset && crossesOffset
				} pointer-events-none lg:right-[3.20rem] lg:block`}
			/>
		</>
	);
};

export default SectionSvg;

export const PlusSvg = ({ className = '' }) => {
	return (
		<svg
			aria-label="Plus"
			className={`${className} || ""`}
			fill="none"
			height="11"
			width="11"
		>
			<title>Plus</title>
			<path
				d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
				fill="#878787"
			/>
		</svg>
	);
};

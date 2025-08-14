import type React from 'react';
import SectionSvg from './section-svg';

const Section = ({
	className,
	id,
	crosses,
	crossesOffset,
	customPaddings,
	children,
}: {
	className?: string;
	id: string;
	crosses?: boolean;
	crossesOffset?: string;
	customPaddings?: boolean;
	children: React.ReactNode;
}) => {
	return (
		<div
			className={`relative w-full ${customPaddings ? '' : 'py-8 sm:py-12 lg:py-16 xl:py-20'} ${className || ''} `}
			id={id}
		>
			{children}

			{/* Left border line - hidden on mobile, visible on larger screens */}
			<div className="pointer-events-none absolute top-0 left-4 hidden h-[calc(100%_+_30px)] w-px bg-stone-200 sm:left-6 lg:left-16 lg:block xl:left-16 dark:bg-border" />

			{/* Right border line - hidden on mobile, visible on larger screens */}
			<div className="pointer-events-none absolute top-0 right-4 hidden h-[calc(100%_+_30px)] w-px bg-stone-200 sm:right-6 lg:right-14 lg:block xl:right-14 dark:bg-border" />

			{crosses && <SectionSvg crossesOffset={crossesOffset} />}
		</div>
	);
};

export default Section;

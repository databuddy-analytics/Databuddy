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
			<div className="flex w-full">
				{/* Left border line - hidden on mobile, visible on larger screens */}
				<div className="hidden w-px flex-shrink-0 bg-stone-200 lg:block dark:bg-border" />

				{/* Content with spacing */}
				<div className="flex-1">{children}</div>

				{/* Right border line - hidden on mobile, visible on larger screens */}
				<div className="hidden w-px flex-shrink-0 bg-stone-200 lg:block dark:bg-border" />
			</div>

			{crosses && <SectionSvg crossesOffset={crossesOffset} />}
		</div>
	);
};

export default Section;

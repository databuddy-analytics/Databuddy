import type React from 'react';
import { cn } from '@/lib/utils';
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
			className={cn(
				'relative w-full border-x-0 lg:border-x',
				!customPaddings && 'py-8 sm:py-12 lg:py-16 xl:py-20',
				className
			)}
			id={id}
		>
			{children}
			{crosses && <SectionSvg crossesOffset={crossesOffset} />}
		</div>
	);
};

export default Section;

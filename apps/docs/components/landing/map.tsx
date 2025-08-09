import Image from 'next/image';

export const WorldMap = () => {
	return (
		<Image
			alt="World map visualization"
			height={327}
			priority={false}
			src={'/world.svg'}
			width={559}
		/>
	);
};

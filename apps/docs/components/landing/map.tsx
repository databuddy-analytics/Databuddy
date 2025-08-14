import Image from 'next/image';

export const WorldMap = () => {
	return (
		<Image
			alt="World map visualization"
			draggable={false}
			height={327}
			priority={true}
			src={'/world.svg'}
			width={559}
		/>
	);
};

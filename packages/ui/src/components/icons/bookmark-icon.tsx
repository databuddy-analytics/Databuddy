import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const BookmarkIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M14.25 17C14.1045 17 13.9595 16.9575 13.834 16.874L9 13.6513L4.166 16.874C3.936 17.0273 3.6396 17.0425 3.396 16.9111C3.1523 16.7807 3 16.5263 3 16.25V3.75C3 2.2334 4.2334 1 5.75 1H12.25C13.7666 1 15 2.2334 15 3.75V16.25C15 16.5264 14.8477 16.7808 14.604 16.9111C14.4932 16.9707 14.3716 17 14.25 17Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);

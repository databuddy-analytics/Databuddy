import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CircleIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M1 9C1 4.58179 4.58179 1 9 1C13.4182 1 17 4.58179 17 9C17 13.4182 13.4182 17 9 17C4.58179 17 1 13.4182 1 9Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
CircleIcon.displayName = "CircleIcon";

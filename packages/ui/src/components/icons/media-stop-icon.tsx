import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const MediaStopIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2 4.75C2 3.23119 3.23119 2 4.75 2H13.25C14.7688 2 16 3.23119 16 4.75V13.25C16 14.7688 14.7688 16 13.25 16H4.75C3.23119 16 2 14.7688 2 13.25V4.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);

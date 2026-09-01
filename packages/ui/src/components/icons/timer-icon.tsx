import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const TimerIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M1 9C1 4.58179 4.58179 1 9 1C13.4182 1 17 4.58179 17 9C17 13.4182 13.4182 17 9 17C4.58179 17 1 13.4182 1 9Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M9.75 1.0347V3.25C9.75 3.66421 9.41421 4 9 4C8.58579 4 8.25 3.66421 8.25 3.25V1.0347C8.49692 1.01174 8.74709 1 9 1C9.25291 1 9.50308 1.01174 9.75 1.0347Z"
			fill="currentColor"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M5.56066 4.5C5.26777 4.20711 4.79289 4.20711 4.5 4.5C4.20711 4.79289 4.20711 5.26777 4.5 5.56066L7.35133 8.41198C7.28573 8.59577 7.25001 8.79373 7.25001 9C7.25001 9.96622 8.0338 10.75 9.00001 10.75C9.96623 10.75 10.75 9.96622 10.75 9C10.75 8.03379 9.96623 7.25 9.00001 7.25C8.79374 7.25 8.59578 7.28572 8.41199 7.35132L5.56066 4.5Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);

import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const FloppyDiskIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M4.41 1.5C2.80279 1.5 1.5 2.80279 1.5 4.41V13.59C1.5 15.1972 2.80279 16.5 4.41 16.5H13.59C15.1972 16.5 16.5 15.1972 16.5 13.59V6.164C16.5 5.70014 16.316 5.25536 15.9873 4.92667L13.074 2.0133C12.7449 1.68294 12.2983 1.5 11.836 1.5H4.41Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			d="M11.5 1.5V4.25C11.5 5.21621 10.7162 6 9.75 6H6.25C5.28379 6 4.5 5.21621 4.5 4.25V1.5H11.5Z"
			fill="currentColor"
		/>{" "}
		<path
			d="M13.5 16.5V11.75C13.5 10.7838 12.7162 10 11.75 10H6.25C5.28379 10 4.5 10.7838 4.5 11.75V16.5H13.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
FloppyDiskIcon.displayName = "FloppyDiskIcon";

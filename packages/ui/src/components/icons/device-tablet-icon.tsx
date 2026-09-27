import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const DeviceTabletIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2 3.75C2 2.23069 3.23128 1 4.75 1H13.25C14.7687 1 16 2.23069 16 3.75V14.25C16 15.7693 14.7687 17 13.25 17H4.75C3.23128 17 2 15.7693 2 14.25V3.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M7 3.25C7 2.83579 7.33579 2.5 7.75 2.5H10.25C10.6642 2.5 11 2.83579 11 3.25C11 3.66421 10.6642 4 10.25 4H7.75C7.33579 4 7 3.66421 7 3.25Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);

import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const WarningCircleIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9 1C4.589 1 1 4.5889 1 9C1 13.4111 4.589 17 9 17C13.411 17 17 13.4111 17 9C17 4.5889 13.411 1 9 1Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M8.25 5.4312C8.25 5.0171 8.5859 4.6812 9 4.6812C9.4141 4.6812 9.75 5.0171 9.75 5.4312V9.5C9.75 9.9141 9.4141 10.25 9 10.25C8.5859 10.25 8.25 9.9141 8.25 9.5V5.4312ZM9 13.417C8.448 13.417 8 12.968 8 12.417C8 11.866 8.448 11.417 9 11.417C9.552 11.417 10 11.866 10 12.417C10 12.968 9.552 13.417 9 13.417Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
WarningCircleIcon.displayName = "WarningCircleIcon";

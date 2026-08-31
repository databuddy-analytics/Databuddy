import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const IdBadgeIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M3.75 3.5C2.23079 3.5 1 4.73079 1 6.25V12.75C1 14.2692 2.23079 15.5 3.75 15.5H14.25C15.7692 15.5 17 14.2692 17 12.75V6.25C17 4.73079 15.7692 3.5 14.25 3.5H3.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
		<path
			d="M10.75 2.5V4.6C10.75 4.82091 10.5709 5 10.35 5H7.65C7.42909 5 7.25 4.82091 7.25 4.6V2.5C7.25 1.5335 8.0335 0.75 9 0.75C9.9665 0.75 10.75 1.5335 10.75 2.5Z"
			fill="currentColor"
		/>
		<path
			clipRule="evenodd"
			d="M4 8.25C4 7.83579 4.33579 7.5 4.75 7.5H7.75C8.16421 7.5 8.5 7.83579 8.5 8.25V11.25C8.5 11.6642 8.16421 12 7.75 12H4.75C4.33579 12 4 11.6642 4 11.25V8.25Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M9.75 8.25C9.75 7.83579 10.0858 7.5 10.5 7.5H13.25C13.6642 7.5 14 7.83579 14 8.25C14 8.66421 13.6642 9 13.25 9H10.5C10.0858 9 9.75 8.66421 9.75 8.25Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M9.75 11.25C9.75 10.8358 10.0858 10.5 10.5 10.5H13.25C13.6642 10.5 14 10.8358 14 11.25C14 11.6642 13.6642 12 13.25 12H10.5C10.0858 12 9.75 11.6642 9.75 11.25Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
IdBadgeIcon.displayName = "IdBadgeIcon";

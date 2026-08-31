import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ChartLineIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2.75 2C3.16421 2 3.5 2.33579 3.5 2.75V12.75C3.5 13.4408 4.05921 14 4.75 14H15.25C15.6642 14 16 14.3358 16 14.75C16 15.1642 15.6642 15.5 15.25 15.5H4.75C3.23079 15.5 2 14.2692 2 12.75V2.75C2 2.33579 2.33579 2 2.75 2Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M3.5 11.0607L6.7495 7.81117L9.86567 10.9273C10.3536 11.4152 11.1454 11.4152 11.6333 10.9273L15.7793 6.78134C16.0722 6.48844 16.0722 6.01357 15.7793 5.72068C15.4864 5.42778 15.0116 5.42778 14.7187 5.72068L10.7495 9.68985L7.63333 6.57368C7.14544 6.08578 6.35356 6.08578 5.86567 6.57368L3.5 8.93935V11.0607Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
ChartLineIcon.displayName = "ChartLineIcon";

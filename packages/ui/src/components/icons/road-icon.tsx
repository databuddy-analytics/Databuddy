import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const RoadIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M5.03569 2.52142C5.13509 2.21078 5.42385 2 5.75001 2H12.25C12.5762 2 12.8649 2.21078 12.9643 2.52142L16.9643 15.0214C17.0373 15.2495 16.997 15.4988 16.8558 15.6922C16.7146 15.8856 16.4895 16 16.25 16H1.75001C1.51052 16 1.28543 15.8856 1.14423 15.6922C1.00303 15.4988 0.962697 15.2495 1.03569 15.0214L5.03569 2.52142Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M9 4C9.41421 4 9.75 4.33579 9.75 4.75V5.75C9.75 6.16421 9.41421 6.5 9 6.5C8.58579 6.5 8.25 6.16421 8.25 5.75V4.75C8.25 4.33579 8.58579 4 9 4Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M9 7.75C9.41421 7.75 9.75 8.08579 9.75 8.5V9.5C9.75 9.91421 9.41421 10.25 9 10.25C8.58579 10.25 8.25 9.91421 8.25 9.5V8.5C8.25 8.08579 8.58579 7.75 9 7.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M9 11.5C9.41421 11.5 9.75 11.8358 9.75 12.25V13.25C9.75 13.6642 9.41421 14 9 14C8.58579 14 8.25 13.6642 8.25 13.25V12.25C8.25 11.8358 8.58579 11.5 9 11.5Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
RoadIcon.displayName = "RoadIcon";

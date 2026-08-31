import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const RobotIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2 7.75C2 6.23079 3.23079 5 4.75 5H13.25C14.7692 5 16 6.23079 16 7.75V13.75C16 15.2692 14.7692 16.5 13.25 16.5H4.75C3.23079 16.5 2 15.2692 2 13.75V7.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
		<path
			d="M6 11C6.552 11 7 10.552 7 10C7 9.448 6.552 9 6 9C5.448 9 5 9.448 5 10C5 10.552 5.448 11 6 11Z"
			fill="currentColor"
		/>
		<path
			d="M12 11C12.552 11 13 10.552 13 10C13 9.448 12.552 9 12 9C11.448 9 11 9.448 11 10C11 10.552 11.448 11 12 11Z"
			fill="currentColor"
		/>
		<path
			d="M7.83331 11.5H10.1666C10.4886 11.5 10.7499 11.7613 10.7499 12.0833C10.7499 13.0493 9.96591 13.8333 8.99991 13.8333C8.03391 13.8333 7.24991 13.0493 7.24991 12.0833C7.24991 11.7613 7.51131 11.5 7.83331 11.5Z"
			fill="currentColor"
		/>
		<path
			d="M9.75 2.25C9.75 1.83579 9.41421 1.5 9 1.5C8.58579 1.5 8.25 1.83579 8.25 2.25V5H9.75V2.25Z"
			fill="currentColor"
		/>
		<path
			d="M2 10H1C0.585786 10 0.25 10.3358 0.25 10.75C0.25 11.1642 0.585786 11.5 1 11.5H2V10Z"
			fill="currentColor"
		/>
		<path
			d="M16 11.5H17C17.4142 11.5 17.75 11.1642 17.75 10.75C17.75 10.3358 17.4142 10 17 10H16V11.5Z"
			fill="currentColor"
		/>
		<path
			d="M9 3.25C9.897 3.25 10.625 2.5224 10.625 1.625C10.625 0.7276 9.897 0 9 0C8.103 0 7.375 0.7276 7.375 1.625C7.375 2.5224 8.103 3.25 9 3.25Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
RobotIcon.displayName = "RobotIcon";

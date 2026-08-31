import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const LockIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2.5 10.25C2.5 8.73119 3.73119 7.5 5.25 7.5H12.75C14.2688 7.5 15.5 8.73119 15.5 10.25V14.25C15.5 15.7688 14.2688 17 12.75 17H5.25C3.73119 17 2.5 15.7688 2.5 14.25V10.25Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M9 11C9.41421 11 9.75 11.3358 9.75 11.75V12.75C9.75 13.1642 9.41421 13.5 9 13.5C8.58579 13.5 8.25 13.1642 8.25 12.75V11.75C8.25 11.3358 8.58579 11 9 11Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
		<path
			d="M6.5 5C6.5 3.61921 7.61921 2.5 9 2.5C10.3808 2.5 11.5 3.61921 11.5 5V7.5H12.75C12.8343 7.5 12.9177 7.50379 13 7.51121V5C13 2.79079 11.2092 1 9 1C6.79079 1 5 2.79079 5 5V7.51121C5.08234 7.50379 5.16573 7.5 5.25 7.5H6.5V5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
LockIcon.displayName = "LockIcon";

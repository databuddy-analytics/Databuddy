import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const QrCodeIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M2 11.25C2 10.2839 2.78334 9.5 3.75 9.5H6.75C7.71666 9.5 8.5 10.2839 8.5 11.25V14.25C8.5 15.2161 7.71666 16 6.75 16H3.75C2.78334 16 2 15.2161 2 14.25V11.25Z"
			fillRule="evenodd"
			clipRule="evenodd"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			d="M2 3.75C2 2.78393 2.78334 2 3.75 2H6.75C7.71666 2 8.5 2.78393 8.5 3.75V6.75C8.5 7.71607 7.71666 8.5 6.75 8.5H3.75C2.78334 8.5 2 7.71607 2 6.75V3.75Z"
			fillRule="evenodd"
			clipRule="evenodd"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			d="M9.5 3.75C9.5 2.78393 10.2833 2 11.25 2H14.25C15.2167 2 16 2.78393 16 3.75V6.75C16 7.71607 15.2167 8.5 14.25 8.5H11.25C10.2833 8.5 9.5 7.71607 9.5 6.75V3.75Z"
			fillRule="evenodd"
			clipRule="evenodd"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path d="M6.5 11.5L4 11.5V14H6.5V11.5Z" fill="currentColor" />
		<path d="M6.5 4L4 4V6.5H6.5V4Z" fill="currentColor" />
		<path d="M14 4L11.5 4V6.5H14V4Z" fill="currentColor" />
		<path d="M16 14.5H14.5V16H16V14.5Z" fill="currentColor" />
		<path d="M14.5 13H13V14.5H14.5V13Z" fill="currentColor" />
		<path d="M16 11.5H14.5V13H16V11.5Z" fill="currentColor" />
		<path d="M13 14.5H11V16H13V14.5Z" fill="currentColor" />
		<path d="M11 11.5H9.5V14.5H11V11.5Z" fill="currentColor" />
		<path d="M14.5 10H11V11.5H14.5V10Z" fill="currentColor" />
	</NucleoIcon>
);
QrCodeIcon.displayName = "QrCodeIcon";

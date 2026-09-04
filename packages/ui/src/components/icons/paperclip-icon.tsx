import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const PaperclipIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M4 4.75C4 2.67879 5.67879 1 7.75 1C9.82121 1 11.5 2.67879 11.5 4.75V11.75C11.5 12.9922 10.4922 14 9.25 14C8.00779 14 7 12.9922 7 11.75V5C7 4.58579 7.33579 4.25 7.75 4.25C8.16421 4.25 8.5 4.58579 8.5 5V11.75C8.5 12.1638 8.83621 12.5 9.25 12.5C9.66379 12.5 10 12.1638 10 11.75V4.75C10 3.50721 8.99279 2.5 7.75 2.5C6.50721 2.5 5.5 3.50721 5.5 4.75V11.75C5.5 13.8208 7.17921 15.5 9.25 15.5C11.3208 15.5 13 13.8208 13 11.75V5C13 4.58579 13.3358 4.25 13.75 4.25C14.1642 4.25 14.5 4.58579 14.5 5V11.75C14.5 14.6492 12.1492 17 9.25 17C6.35079 17 4 14.6492 4 11.75V4.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);

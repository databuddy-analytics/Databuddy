import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const FolderSimpleIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M1.5 6.5H16.5V13.25C16.5 14.7692 15.2692 16 13.75 16H4.25C2.73079 16 1.5 14.7692 1.5 13.25V6.5Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			d="M4.25 2C2.73079 2 1.5 3.23079 1.5 4.75V6.5H16.5V6.25C16.5 4.73079 15.2692 3.5 13.75 3.5H8.72395L8.34569 3.02827C7.82347 2.37825 7.03552 2 6.201 2H4.25Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
FolderSimpleIcon.displayName = "FolderSimpleIcon";

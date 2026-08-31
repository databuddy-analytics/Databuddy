import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const DevicesIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M1.5 16C0.949 16 0.5 15.551 0.5 15C0.5 14.449 0.949 14 1.5 14C2.051 14 2.5 14.449 2.5 15C2.5 15.551 2.051 16 1.5 16Z"
			fill="currentColor"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M0.5 11.75C0.5 11.3358 0.835786 11 1.25 11H1.5C3.70921 11 5.5 12.7908 5.5 15V15.25C5.5 15.6642 5.16421 16 4.75 16C4.33579 16 4 15.6642 4 15.25V15C4 13.6192 2.88079 12.5 1.5 12.5H1.25C0.835786 12.5 0.5 12.1642 0.5 11.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M0.5 8.75C0.5 8.33579 0.835786 8 1.25 8H1.5C5.36621 8 8.5 11.1338 8.5 15V15.25C8.5 15.6642 8.16421 16 7.75 16C7.33579 16 7 15.6642 7 15.25V15C7 11.9622 4.53779 9.5 1.5 9.5H1.25C0.835786 9.5 0.5 9.16421 0.5 8.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M2 5.75C2 4.23079 3.23079 3 4.75 3H14.25C15.7692 3 17 4.23079 17 5.75V10.25C17 11.7692 15.7692 13 14.25 13H9.7634C8.90175 9.42678 5.78287 6.73386 2 6.51446V5.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);
DevicesIcon.displayName = "DevicesIcon";

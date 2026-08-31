import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const FlaskIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M10.75 1C11.1642 1 11.5 1.33579 11.5 1.75V6.81869L15.045 13.7221C15.8148 15.2196 14.7268 17 13.044 17H4.95601C3.27319 17 2.18524 15.2196 2.95498 13.7221L6.50001 6.81869V1.75C6.50001 1.33579 6.8358 1 7.25001 1H10.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			d="M13.6472 11L15.045 13.7221C15.8148 15.2196 14.7268 17 13.044 17H4.95601C3.27319 17 2.18524 15.2196 2.95498 13.7221L4.35284 11H13.6472Z"
			fill="currentColor"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M5 1.75C5 1.33579 5.33579 1 5.75 1H12.25C12.6642 1 13 1.33579 13 1.75C13 2.16421 12.6642 2.5 12.25 2.5H5.75C5.33579 2.5 5 2.16421 5 1.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
FlaskIcon.displayName = "FlaskIcon";

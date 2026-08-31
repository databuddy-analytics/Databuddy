import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const UserIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M2.60518 13.1674C3.69058 10.7157 6.14168 9 8.99999 9C11.7634 9 14.1462 10.6037 15.2822 12.9257C15.3564 13.0774 15.4289 13.2326 15.4797 13.3894C15.8649 14.5805 15.1811 15.8552 13.9874 16.2313C12.705 16.6354 11.0072 17 8.99999 17C6.99283 17 5.29503 16.6354 4.01259 16.2313C2.74425 15.8317 2.05162 14.4186 2.60518 13.1674Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
		<path
			d="M9 7.50049C10.7952 7.50049 12.25 6.04543 12.25 4.25049C12.25 2.45554 10.7952 1.00049 9 1.00049C7.20482 1.00049 5.75 2.45554 5.75 4.25049C5.75 6.04543 7.20482 7.50049 9 7.50049Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
UserIcon.displayName = "UserIcon";

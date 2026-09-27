import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CaretUpIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M10.478 3.38898C10.155 2.87998 9.60299 2.57703 8.99999 2.57703C8.39699 2.57703 7.84499 2.88098 7.52199 3.38898L2.497 11.313C2.156 11.852 2.13497 12.535 2.44197 13.094C2.74897 13.653 3.33699 14 3.97499 14H14.024C14.662 14 15.25 13.653 15.557 13.094C15.864 12.535 15.844 11.852 15.502 11.313L10.478 3.38898Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);

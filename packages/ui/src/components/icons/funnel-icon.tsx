import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const FunnelIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M2.74999 2C2.46499 2 2.20499 2.161 2.07899 2.416C1.95199 2.671 1.98099 2.976 2.15299 3.203L7.00099 9.602V16.25C7.00099 16.515 7.14099 16.761 7.36899 16.896C7.48699 16.966 7.61899 17 7.75099 17C7.87599 17 7.99999 16.969 8.11199 16.907L10.612 15.532C10.852 15.4 11.001 15.148 11.001 14.875V9.602L15.848 3.203C16.02 2.976 16.049 2.671 15.922 2.416C15.796 2.161 15.535 2 15.251 2H2.74999Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);
FunnelIcon.displayName = "FunnelIcon";

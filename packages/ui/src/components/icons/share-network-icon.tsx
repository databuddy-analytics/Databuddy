import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ShareNetworkIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M1.62639 10.5121L4.55718 13.4429L9.00008 9L4.55718 4.5571L1.62639 7.48792C0.791286 8.32302 0.791286 9.67698 1.62639 10.5121Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M13.443 13.4429L16.3738 10.5121C17.2089 9.67698 17.2089 8.32302 16.3738 7.48792L13.443 4.5571L9.00009 9L13.443 13.4429Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M13.443 4.55711L10.5122 1.62633C9.67709 0.791225 8.32309 0.791225 7.48799 1.62633L4.55719 4.55711L9.00009 9.00001L13.443 4.55711Z"
			fill="currentColor"
		/>{" "}
		<path
			d="M13.443 13.4429L10.5122 16.3737C9.67709 17.2088 8.32309 17.2088 7.48799 16.3737L4.55719 13.4429L9.00009 9L13.443 13.4429Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);

import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ArrowRightIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M15 9.75H2.75C2.336 9.75 2 9.414 2 9C2 8.586 2.336 8.25 2.75 8.25H15C15.414 8.25 15.75 8.586 15.75 9C15.75 9.414 15.414 9.75 15 9.75Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M11 14C10.808 14 10.616 13.927 10.47 13.78C10.177 13.487 10.177 13.012 10.47 12.719L14.19 8.99899L10.47 5.279C10.177 4.986 10.177 4.511 10.47 4.218C10.763 3.925 11.238 3.925 11.531 4.218L15.781 8.468C16.074 8.761 16.074 9.236 15.781 9.529L11.531 13.779C11.385 13.925 11.193 13.999 11.001 13.999L11 14Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);

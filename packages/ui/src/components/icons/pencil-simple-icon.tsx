import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const PencilSimpleIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M10.4084 3C10.7013 2.70711 11.1761 2.70711 11.469 3L14.999 6.52999C15.1397 6.67064 15.2187 6.86141 15.2187 7.06032C15.2187 7.25923 15.1397 7.45 14.999 7.59065L8.20732 14.3823C7.86423 14.7254 7.43549 14.9731 6.96426 15.0972L2.69126 16.2242C2.43318 16.2923 2.15838 16.2181 1.96966 16.0293C1.78093 15.8406 1.70672 15.5658 1.77479 15.3077L2.90179 11.0347L2.9022 11.0332C3.0269 10.5645 3.27251 10.1358 3.61666 9.79169L10.4084 3Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M11.0014 2.40885C11.8797 1.52933 13.3048 1.53005 14.1833 2.40862L15.5919 3.81717C16.4714 4.69543 16.4709 6.12071 15.5923 6.99928L13.9833 8.60829L9.39267 4.01763L11.0014 2.40885Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M12.5297 6.5L6.79534 12.2343C6.50245 12.5272 6.02758 12.5272 5.73468 12.2343C5.44179 11.9414 5.44179 11.4665 5.73469 11.1736L11.469 5.43934L12.5297 6.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
PencilSimpleIcon.displayName = "PencilSimpleIcon";

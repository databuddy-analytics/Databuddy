import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CompassIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M9 1C4.58179 1 1 4.58168 1 9C1 13.4183 4.58179 17 9 17C13.4182 17 17 13.4183 17 9C17 4.58168 13.4182 1 9 1ZM9 10C9.55229 10 10 9.55229 10 9C10 8.44772 9.55229 8 9 8C8.44772 8 8 8.44772 8 9C8 9.55229 8.44772 10 9 10Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M12.9828 5.99144C13.0936 5.7131 13.0282 5.39551 12.8164 5.18367C12.6045 4.97182 12.2869 4.90637 12.0086 5.0172L7.30958 6.8882C7.11812 6.96443 6.96646 7.11609 6.89023 7.30755L5.01923 12.0066C4.9084 12.2849 4.97385 12.6025 5.1857 12.8143C5.39754 13.0262 5.71513 13.0916 5.99347 12.9808L10.6925 11.1098C10.8839 11.0336 11.0356 10.8819 11.1118 10.6904L12.9828 5.99144ZM10 9C10 9.5523 9.552 10 9 10C8.448 10 8 9.5523 8 9C8 8.4477 8.448 8 9 8C9.552 8 10 8.4477 10 9Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
CompassIcon.displayName = "CompassIcon";

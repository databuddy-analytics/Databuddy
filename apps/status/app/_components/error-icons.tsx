import type { SVGProps } from "react";

type ErrorIconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function ErrorIcon({ size = 18, children, ...props }: ErrorIconProps) {
	return (
		<svg
			aria-hidden="true"
			fill="currentColor"
			height={size}
			viewBox="0 0 18 18"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			{children}
		</svg>
	);
}

export function ArrowClockwiseIcon(props: ErrorIconProps) {
	return (
		<ErrorIcon {...props}>
			<path
				d="M9 17C4.589 17 1 13.411 1 9C1 4.589 4.589 1 9 1C12.164 1 15.037 2.87001 16.318 5.76401C16.486 6.14301 16.315 6.58601 15.936 6.75301C15.557 6.92101 15.115 6.75 14.947 6.371C13.905 4.019 11.571 2.49899 9 2.49899C5.416 2.49899 2.5 5.41499 2.5 8.99899C2.5 12.583 5.416 15.499 9 15.499C11.155 15.499 13.167 14.433 14.38 12.648C14.613 12.304 15.081 12.217 15.422 12.449C15.765 12.681 15.854 13.148 15.621 13.491C14.128 15.688 11.654 16.999 9.00101 16.999L9 17Z"
				fill="currentColor"
				opacity="0.4"
			/>
			<path
				d="M15.713 7C15.679 7 15.644 6.998 15.609 6.993L12.665 6.586C12.254 6.529 11.968 6.15001 12.024 5.74001C12.081 5.33001 12.461 5.047 12.87 5.099L15.071 5.40401L15.376 3.202C15.432 2.792 15.804 2.503 16.222 2.562C16.632 2.619 16.919 2.99701 16.862 3.40801L16.454 6.353C16.402 6.728 16.082 7 15.713 7Z"
				fill="currentColor"
			/>
		</ErrorIcon>
	);
}

export function ArrowRightIcon(props: ErrorIconProps) {
	return (
		<ErrorIcon {...props}>
			<path
				d="M15 9.75H2.75C2.336 9.75 2 9.414 2 9C2 8.586 2.336 8.25 2.75 8.25H15C15.414 8.25 15.75 8.586 15.75 9C15.75 9.414 15.414 9.75 15 9.75Z"
				fill="currentColor"
				opacity="0.4"
			/>
			<path
				d="M11 14C10.808 14 10.616 13.927 10.47 13.78C10.177 13.487 10.177 13.012 10.47 12.719L14.19 8.99899L10.47 5.279C10.177 4.986 10.177 4.511 10.47 4.218C10.763 3.925 11.238 3.925 11.531 4.218L15.781 8.468C16.074 8.761 16.074 9.236 15.781 9.529L11.531 13.779C11.385 13.925 11.193 13.999 11.001 13.999L11 14Z"
				fill="currentColor"
			/>
		</ErrorIcon>
	);
}

export function WarningCircleIcon(props: ErrorIconProps) {
	return (
		<ErrorIcon {...props}>
			<path
				d="M9 1C4.589 1 1 4.5889 1 9C1 13.4111 4.589 17 9 17C13.411 17 17 13.4111 17 9C17 4.5889 13.411 1 9 1Z"
				fill="currentColor"
				opacity="0.4"
			/>
			<path
				d="M8.25 5.4312C8.25 5.0171 8.5859 4.6812 9 4.6812C9.4141 4.6812 9.75 5.0171 9.75 5.4312V9.5C9.75 9.9141 9.4141 10.25 9 10.25C8.5859 10.25 8.25 9.9141 8.25 9.5V5.4312ZM9 13.417C8.448 13.417 8 12.968 8 12.417C8 11.866 8.448 11.417 9 11.417C9.552 11.417 10 11.866 10 12.417C10 12.968 9.552 13.417 9 13.417Z"
				fill="currentColor"
			/>
		</ErrorIcon>
	);
}

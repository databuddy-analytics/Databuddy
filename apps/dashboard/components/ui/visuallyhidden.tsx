import type { PropsWithChildren } from "react";

export default function VisuallyHidden({ children }: PropsWithChildren) {
	return <div className="sr-only">{children}</div>;
}

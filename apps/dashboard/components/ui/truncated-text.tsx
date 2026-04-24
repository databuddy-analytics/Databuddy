"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ds/tooltip";

type TruncatedTextProps = {
	text: string;
	className?: string;
	side?: "top" | "right" | "bottom" | "left";
	id?: string;
};

export const TruncatedText = ({
	text,
	className,
	side = "right",
	id,
}: TruncatedTextProps) => {
	const [isTextTruncated, setIsTextTruncated] = useState(false);
	const elementRef = useRef<HTMLSpanElement | null>(null);

	const checkTextOverflow = useCallback((node: HTMLSpanElement | null) => {
		if (node) {
			setIsTextTruncated(node.scrollWidth > node.clientWidth);
		}
	}, []);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) {
			return;
		}

		const checkOverflow = () => {
			setIsTextTruncated(element.scrollWidth > element.clientWidth);
		};

		checkOverflow();

		const resizeObserver = new ResizeObserver(checkOverflow);
		resizeObserver.observe(element);

		const handleWindowResize = () => {
			checkOverflow();
		};
		window.addEventListener("resize", handleWindowResize);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", handleWindowResize);
		};
	}, []);

	const span = (
		<span
			className={className}
			id={id}
			ref={(node) => {
				elementRef.current = node;
				checkTextOverflow(node);
			}}
		>
			{text}
		</span>
	);

	if (!isTextTruncated) {
		return span;
	}

	return (
		<Tooltip content={text} side={side}>
			{span}
		</Tooltip>
	);
};

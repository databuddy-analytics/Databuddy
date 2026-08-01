"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ChartErrorBoundaryProps {
	children: ReactNode;
	fallbackClassName?: string;
}

interface ChartErrorBoundaryState {
	hasError: boolean;
}

export class ChartErrorBoundary extends Component<
	ChartErrorBoundaryProps,
	ChartErrorBoundaryState
> {
	constructor(props: ChartErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): ChartErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[ChartErrorBoundary]", error.message, info.componentStack);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					className={`flex items-center justify-center ${this.props.fallbackClassName ?? ""}`}
				>
					<Button
						className="h-auto px-0 py-0 text-xs"
						onClick={() => this.setState({ hasError: false })}
						type="button"
						variant="ghost"
					>
						Failed to render chart — click to retry
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}

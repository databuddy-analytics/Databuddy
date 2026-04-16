import { Slot } from "@radix-ui/react-slot";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { EmptyState, type EmptyStateProps } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	ListQueryOutcome,
	ListQuerySlice,
} from "@/lib/list-query-outcome";
import { listQueryOutcomeFromQuery } from "@/lib/list-query-outcome";
import { cn } from "@/lib/utils";

interface ListRootProps {
	children: ReactNode;
	className?: string;
}

function ListRoot({ children, className }: ListRootProps) {
	return (
		<div className={cn("w-full overflow-x-auto", className)} data-slot="list">
			{children}
		</div>
	);
}

interface ListHeadProps {
	children: ReactNode;
	className?: string;
	sticky?: boolean;
}

function ListHead({ children, className, sticky = false }: ListHeadProps) {
	return (
		<div
			className={cn(
				"flex w-full min-w-0 items-start gap-4 border-b bg-card px-4 py-2 text-muted-foreground text-xs",
				sticky && "sticky top-0 z-10",
				className
			)}
			data-slot="list-head"
		>
			{children}
		</div>
	);
}

interface ListRowProps {
	align?: "center" | "start";
	asChild?: boolean;
	children: ReactNode;
	className?: string;
	density?: "comfortable" | "compact";
	interactive?: boolean;
}

function ListRow({
	align = "center",
	asChild = false,
	children,
	className,
	density = "comfortable",
	interactive = true,
}: ListRowProps) {
	const Comp = asChild ? Slot : "div";
	return (
		<Comp
			className={cn(
				"group flex w-full min-w-0 border-border/80 border-b transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				align === "center" ? "items-center" : "items-start",
				density === "comfortable" && "gap-4 px-4 py-3",
				density === "compact" && "gap-3 px-3 py-3 sm:gap-4 sm:px-4",
				interactive && "hover:bg-accent/50",
				className
			)}
			data-slot="list-row"
		>
			{children}
		</Comp>
	);
}

interface ListCellProps extends ComponentPropsWithoutRef<"div"> {
	action?: boolean;
	align?: "start" | "center" | "end";
	grow?: boolean;
}

function ListCell({
	action = false,
	align = "start",
	children,
	className,
	grow = false,
	onClick,
	onKeyDown,
	...props
}: ListCellProps) {
	if (action) {
		return (
			<div
				{...props}
				className={cn("shrink-0", className)}
				data-slot="list-cell"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onClick?.(e);
				}}
				onKeyDown={(e) => {
					e.stopPropagation();
					onKeyDown?.(e);
				}}
				role="presentation"
			>
				{children}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex min-w-0 items-center",
				!grow && "shrink-0",
				grow && "flex-1",
				align === "center" && "justify-center text-center",
				align === "end" && "justify-end text-balance text-right",
				className
			)}
			data-slot="list-cell"
			{...props}
		>
			{children}
		</div>
	);
}

interface ListContentBaseProps<T> {
	children: (items: T[]) => ReactNode;
	/** Shown when outcome is empty; overrides emptyProps */
	empty?: ReactNode;
	/** Passed to EmptyState when outcome is empty (unless `empty` is set) */
	emptyProps?: EmptyStateProps;
	/** Shown when outcome is error; overrides errorProps */
	error?: ReactNode;
	/** Passed to EmptyState with variant `error` when outcome is error (unless `error` is set) */
	errorProps?: EmptyStateProps;
	/** Shown when outcome is loading; defaults to List.DefaultLoading */
	loading?: ReactNode;
	/** Wrapper for default EmptyState branches (not applied to custom `empty` / `error` nodes) */
	stateWrapperClassName?: string;
}

type ListContentProps<T> =
	| (ListContentBaseProps<T> & {
			gatePending?: never;
			outcome: ListQueryOutcome<T>;
			query?: never;
	  })
	| (ListContentBaseProps<T> & {
			gatePending?: boolean;
			outcome?: never;
			query: ListQuerySlice<T>;
	  });

function ListDefaultLoading() {
	return (
		<ListRoot className="rounded bg-card">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className="flex min-h-15 items-center gap-4 border-border/80 border-b px-4 py-3 last:border-b-0"
					key={`list-skeleton-${i + 1}`}
				>
					<Skeleton className="size-8 shrink-0 rounded" />
					<Skeleton className="h-4 w-28 shrink-0" />
					<Skeleton className="h-3 min-w-0 flex-1" />
					<Skeleton className="hidden h-3 w-16 shrink-0 sm:block" />
					<Skeleton className="h-4 w-20 shrink-0" />
				</div>
			))}
		</ListRoot>
	);
}

function ListContent<T>({
	children,
	empty,
	emptyProps,
	error,
	errorProps,
	gatePending,
	loading,
	outcome: outcomeProp,
	query,
	stateWrapperClassName,
}: ListContentProps<T>) {
	const outcome =
		outcomeProp ??
		(query ? listQueryOutcomeFromQuery(query, { gatePending }) : undefined);
	if (!outcome) {
		throw new Error("List.Content requires `query` or `outcome`");
	}

	const stateShell = (node: ReactNode) => (
		<div
			className={cn(
				"flex flex-1 items-center justify-center py-16",
				stateWrapperClassName
			)}
		>
			{node}
		</div>
	);

	if (outcome.status === "loading") {
		return loading ?? <ListDefaultLoading />;
	}
	if (outcome.status === "error") {
		if (error !== undefined) {
			return error;
		}
		if (errorProps) {
			return stateShell(
				<EmptyState {...errorProps} variant={errorProps.variant ?? "error"} />
			);
		}
		return null;
	}
	if (outcome.status === "empty") {
		if (empty !== undefined) {
			return empty;
		}
		if (emptyProps) {
			return stateShell(
				<EmptyState {...emptyProps} variant={emptyProps.variant ?? "minimal"} />
			);
		}
		return null;
	}
	return children(outcome.items);
}

ListRoot.displayName = "List";

export const List = Object.assign(ListRoot, {
	Cell: ListCell,
	Content: ListContent,
	DefaultLoading: ListDefaultLoading,
	Head: ListHead,
	Row: ListRow,
}) as typeof ListRoot & {
	Cell: typeof ListCell;
	Content: typeof ListContent;
	DefaultLoading: typeof ListDefaultLoading;
	Head: typeof ListHead;
	Row: typeof ListRow;
};

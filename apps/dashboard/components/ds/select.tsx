"use client";

import { useFieldContext } from "@/components/ds/field";
import { cn } from "@/lib/utils";
import { Select as BaseSelect } from "@base-ui-components/react/select";
import { CaretUpDown, Check } from "@phosphor-icons/react/dist/ssr";
import {
	Children,
	Fragment,
	isValidElement,
	createContext,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ComponentPropsWithoutRef,
} from "react";

interface LabelRegistryContext {
	deregister: (value: string) => void;
	getLabel: (value: unknown) => string;
	register: (value: string, label: string) => void;
	subscribe: (cb: () => void) => () => void;
}

const LabelRegistryCtx = createContext<LabelRegistryContext | null>(null);

function Root(props: ComponentPropsWithoutRef<typeof BaseSelect.Root>) {
	const labelsRef = useRef<Record<string, string>>({});
	const listenersRef = useRef<Set<() => void>>(new Set());

	const registry = useMemo<LabelRegistryContext>(
		() => ({
			register: (value, label) => {
				labelsRef.current[value] = label;
				for (const cb of listenersRef.current) {
					cb();
				}
			},
			deregister: (value) => {
				delete labelsRef.current[value];
				for (const cb of listenersRef.current) {
					cb();
				}
			},
			subscribe: (cb) => {
				listenersRef.current.add(cb);
				return () => {
					listenersRef.current.delete(cb);
				};
			},
			getLabel: (value) =>
				labelsRef.current[String(value)] ?? String(value ?? ""),
		}),
		[]
	);

	return (
		<LabelRegistryCtx.Provider value={registry}>
			<BaseSelect.Root {...props} />
		</LabelRegistryCtx.Provider>
	);
}

function Trigger({
	className,
	children,
	id,
	render,
	...rest
}: ComponentPropsWithoutRef<typeof BaseSelect.Trigger>) {
	const field = useFieldContext();
	const composedRender =
		render ||
		(Children.count(children) === 1 &&
		isValidElement(children) &&
		children.type !== Fragment
			? (children as React.ReactElement<Record<string, unknown>>)
			: undefined);
	const isComposed = composedRender != null;

	return (
		<BaseSelect.Trigger
			aria-describedby={
				field
					? [field.error && field.errorId, field.descriptionId]
							.filter(Boolean)
							.join(" ") || undefined
					: undefined
			}
			aria-invalid={field?.error || undefined}
			className={
				isComposed
					? className
					: cn(
							"flex h-(--control-h) w-full cursor-pointer select-none items-center justify-between rounded-md bg-secondary px-(--control-px) text-foreground text-xs [--control-h:--spacing(8)] [--control-px:--spacing(3)]",
							"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"data-placeholder:text-muted-foreground",
							field?.error &&
								"ring-2 ring-destructive/60 focus-visible:ring-destructive/60",
							className
						)
			}
			id={id ?? field?.id}
			render={composedRender}
			{...rest}
		>
			{isComposed ? null : (
				<>
					{children ?? <Value />}
					<BaseSelect.Icon>
						<CaretUpDown className="size-3.5 shrink-0 text-muted-foreground" />
					</BaseSelect.Icon>
				</>
			)}
		</BaseSelect.Trigger>
	);
}

function Value(props: ComponentPropsWithoutRef<typeof BaseSelect.Value>) {
	const registry = useContext(LabelRegistryCtx);
	const [, rerender] = useState(0);

	useLayoutEffect(() => {
		if (!registry) {
			return;
		}
		return registry.subscribe(() => rerender((c) => c + 1));
	}, [registry]);

	if (props.children || !registry) {
		return <BaseSelect.Value {...props} />;
	}

	return (
		<BaseSelect.Value {...props}>
			{(value) => registry.getLabel(value)}
		</BaseSelect.Value>
	);
}

function Content({
	className,
	children,
	...rest
}: ComponentPropsWithoutRef<typeof BaseSelect.Popup>) {
	return (
		<BaseSelect.Portal>
			<BaseSelect.Positioner className="z-50" sideOffset={4}>
				<BaseSelect.Popup
					className={cn(
						"min-w-44 overflow-hidden rounded-lg border border-border/60 bg-popover p-1",
						"origin-(--transform-origin)",
						"motion-reduce:transition-none",
						"data-open:fade-in data-open:zoom-in-95 data-open:animate-in data-open:duration-150",
						"not-data-open:fade-out not-data-open:zoom-out-95 not-data-open:animate-out not-data-open:duration-100",
						className
					)}
					{...rest}
				>
					{children}
				</BaseSelect.Popup>
			</BaseSelect.Positioner>
		</BaseSelect.Portal>
	);
}

function Item({
	className,
	children,
	...rest
}: ComponentPropsWithoutRef<typeof BaseSelect.Item>) {
	const registry = useContext(LabelRegistryCtx);
	const label =
		typeof children === "string" ? children : String(children ?? "");

	useLayoutEffect(() => {
		if (!registry || rest.value == null) {
			return;
		}
		const key = String(rest.value);
		registry.register(key, label);
		return () => registry.deregister(key);
	}, [registry, rest.value, label]);

	return (
		<BaseSelect.Item
			className={cn(
				"flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] text-foreground outline-none",
				"data-highlighted:bg-interactive-hover",
				"data-disabled:pointer-events-none data-disabled:opacity-50",
				className
			)}
			{...rest}
		>
			<BaseSelect.ItemIndicator className="flex size-3.5 items-center justify-center">
				<Check className="size-3" />
			</BaseSelect.ItemIndicator>
			<BaseSelect.ItemText>{children}</BaseSelect.ItemText>
		</BaseSelect.Item>
	);
}

function Group(props: ComponentPropsWithoutRef<typeof BaseSelect.Group>) {
	return <BaseSelect.Group {...props} />;
}

function GroupLabel({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseSelect.GroupLabel>) {
	return (
		<BaseSelect.GroupLabel
			className={cn(
				"px-2.5 py-1.5 font-medium text-[11px] text-muted-foreground",
				className
			)}
			{...rest}
		/>
	);
}

export const Select: typeof Root & {
	Content: typeof Content;
	Group: typeof Group;
	GroupLabel: typeof GroupLabel;
	Item: typeof Item;
	Trigger: typeof Trigger;
	Value: typeof Value;
} = Object.assign(Root, {
	Trigger,
	Value,
	Content,
	Item,
	Group,
	GroupLabel,
});

export const SelectTrigger = Trigger;
export const SelectValue = Value;
export const SelectContent = Content;
export const SelectItem = Item;
export const SelectGroup = Group;
export const SelectLabel = GroupLabel;

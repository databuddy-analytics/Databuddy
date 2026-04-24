"use client";

import { cn } from "../lib/utils";
import { Tabs as BaseTabs } from "@base-ui-components/react/tabs";
import type { ComponentPropsWithoutRef } from "react";

function Root({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Root>) {
  return <BaseTabs.Root className={cn("flex flex-col", className)} {...rest} />;
}

function List({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      className={cn(
        "relative flex gap-0.5 rounded-lg border bg-secondary/50 p-1",
        className
      )}
      {...rest}
    />
  );
}

function Tab({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "inline-flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md px-2.5 font-medium text-muted-foreground text-xs",
        "transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
        "hover:bg-interactive-hover hover:text-foreground",
        "data-active:bg-background data-active:text-foreground data-active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...rest}
    />
  );
}

function Panel({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      className={cn("focus-visible:outline-none", className)}
      {...rest}
    />
  );
}

function Indicator({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Indicator>) {
  return (
    <BaseTabs.Indicator
      className={cn(
        "absolute bottom-0 h-0.5 rounded-full bg-primary",
        "transition-[width,transform] duration-(--duration-quick) ease-(--ease-smooth)",
        "motion-reduce:transition-none",
        className
      )}
      {...rest}
    />
  );
}

export const Tabs = Object.assign(Root, {
  List,
  Tab,
  Panel,
  Indicator,
});

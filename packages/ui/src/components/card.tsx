import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

function Root({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-card-foreground",
        className
      )}
      {...rest}
    />
  );
}

function Header({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1 bg-muted px-5 py-4", className)}
      {...rest}
    />
  );
}

function Title({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-semibold text-foreground text-xs", className)}
      {...rest}
    />
  );
}

function Description({
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[11px] text-muted-foreground", className)}
      {...rest}
    />
  );
}

function Content({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

function Footer({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "angled-rectangle-gradient flex items-center justify-end gap-2 bg-muted px-5 py-3",
        className
      )}
      {...rest}
    />
  );
}

function Action({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      data-slot="card-action"
      {...rest}
    />
  );
}

export const Card = Object.assign(Root, {
  Header,
  Title,
  Description,
  Content,
  Footer,
  Action,
});

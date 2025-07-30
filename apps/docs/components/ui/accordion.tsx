"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { PlusIcon } from "lucide-react";
import type * as React from "react";
import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-t last:border-b-0", className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const observer = new MutationObserver(() => {
      const dataState = trigger.getAttribute("data-state");
      setIsOpen(dataState === "open");
    });

    observer.observe(trigger, {
      attributes: true,
      attributeFilter: ["data-state"],
    });

    // Initial check
    const dataState = trigger.getAttribute("data-state");
    setIsOpen(dataState === "open");

    return () => observer.disconnect();
  }, []);

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={triggerRef}
        className={cn(
          "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left font-medium text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        data-slot="accordion-trigger"
        {...props}
      >
        <motion.div
          className="flex-1"
          whileHover={isOpen ? { x: 0 } : { x: 14 }}
          animate={{
            x: isOpen ? 0 : undefined,
          }}
          transition={{
            duration: 0.4,
            ease: [0.785, 0.135, 0.15, 0.86],
          }}
        >
          {children}
        </motion.div>
        <PlusIcon
          strokeWidth={1.5}
          className="size-6 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200 cursor-pointer hover:text-accent-foreground"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      data-slot="accordion-content"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

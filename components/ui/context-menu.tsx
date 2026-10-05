"use client";

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      className={cn("bg-popover text-popover-foreground z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md", className)}
      {...props}
    />
  </ContextMenuPrimitive.Portal>;
}

export function ContextMenuItem({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item
    className={cn("focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className)}
    {...props}
  />;
}

export function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("bg-border -mx-1 my-1 h-px", className)} {...props} />;
}

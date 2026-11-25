"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

/** 모바일 하단 시트(vaul). 보통은 ResponsiveDialog 를 통해 쓴다. */
function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger(props: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay data-slot="drawer-overlay" className="fixed inset-0 z-50 bg-overlay" />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-x border-t bg-popover text-popover-foreground outline-none",
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-input" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("flex flex-col gap-1.5 px-5 pt-4 pb-4", className)} {...props} />;
}

/** 내용이 길면 이 영역만 스크롤된다. */
function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-body" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5", className)} {...props} />;
}

/** 하단 버튼 영역. 홈 인디케이터를 피해 safe-area 만큼 띄운다. */
function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="drawer-footer" className={cn("flex gap-2 border-t px-5 pt-3 pb-safe-3 [&>*]:flex-1", className)} {...props} />
  );
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("text-lg leading-snug font-bold", className)} {...props} />;
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger };

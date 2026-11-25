"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/** 한 화면 안에서 내용을 바꾸는 탭. 다른 경로로 이동하는 탭은 SectionTabs 를 쓴다. */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(tabsListClassName, className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabClassName, "data-[state=active]:text-foreground data-[state=active]:after:bg-foreground", className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />;
}

/** 밑줄 탭 스타일. SectionTabs 와 같이 쓴다. */
const tabsListClassName = "flex items-center gap-5 overflow-x-auto border-b [scrollbar-width:none]";
const tabClassName = cn(
  "relative inline-flex h-11 shrink-0 items-center text-body font-semibold whitespace-nowrap text-muted-foreground",
  "transition-colors outline-none hover:text-foreground",
  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent",
  "focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/40",
  "disabled:pointer-events-none disabled:opacity-50",
);

export { Tabs, TabsContent, TabsList, TabsTrigger, tabClassName, tabsListClassName };

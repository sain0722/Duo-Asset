"use client";

import * as React from "react";

import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsDesktop } from "@/hooks/use-media-query";

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 본문. 길면 이 영역만 스크롤된다. */
  children: React.ReactNode;
  /** 하단 버튼들. 주 버튼을 마지막(오른쪽)에 둔다. */
  footer?: React.ReactNode;
  /** 넘기면 본문과 하단 버튼을 <form> 으로 감싼다. 하단의 type="submit" 버튼과 Enter 로 제출된다. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  className?: string;
};

/**
 * 입력 폼용 모달. PC 에서는 가운데 Dialog, 모바일에서는 하단 Drawer 로 뜬다.
 * 추가·수정 폼은 모두 이 컴포넌트를 쓴다.
 */
function ResponsiveDialog({ open, onOpenChange, title, description, children, footer, onSubmit, className }: ResponsiveDialogProps) {
  const isDesktop = useIsDesktop();

  // 설명이 없으면 Radix 가 찾는 aria-describedby 를 명시적으로 비운다.
  const describedBy = description ? undefined : { "aria-describedby": undefined };

  function wrap(body: React.ReactNode) {
    if (!onSubmit) return body;
    return (
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event);
        }}
      >
        {body}
      </form>
    );
  }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={className} {...describedBy}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {wrap(
            <>
              <DialogBody>{children}</DialogBody>
              {footer && <DialogFooter>{footer}</DialogFooter>}
            </>,
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={className} {...describedBy}>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        {wrap(
          <>
            <DrawerBody>{children}</DrawerBody>
            {/* 하단 버튼이 없으면 홈 인디케이터 영역만 비워 둔다. */}
            {footer ? <DrawerFooter>{footer}</DrawerFooter> : <div aria-hidden className="shrink-0 pb-safe" />}
          </>,
        )}
      </DrawerContent>
    </Drawer>
  );
}

export { ResponsiveDialog };
export type { ResponsiveDialogProps };

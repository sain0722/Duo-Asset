"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 기본 "확인". 동작을 그대로 적는다("삭제", "마감"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 동작이면 확인 버튼을 붉게 표시한다. */
  destructive?: boolean;
  /**
   * 확인을 눌렀을 때. Promise 를 돌려주면 끝날 때까지 버튼을 "진행 중"으로 두고, 성공하면 닫는다.
   * 실패(reject)하면 열어 둔다. 오류 알림은 호출한 쪽에서 한다.
   */
  onConfirm: () => void | Promise<void>;
};

/** 되돌리기 어려운 동작(삭제, 월 마감 등)을 한 번 더 확인받는다. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent {...(description ? undefined : { "aria-describedby": undefined })}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} loading={pending} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
export type { ConfirmDialogProps };

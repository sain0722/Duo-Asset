"use client";

import { useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { restoreBackup } from "@/lib/data/mutations";
import type { BackupFile } from "@/lib/data/types";
import { formatYm } from "@/lib/format";

import { summarizeBackup } from "./backup-file";
import { downloadBackup } from "./download";

/**
 * 백업 복원 확인. ConfirmDialog 와 같은 모양이지만, 가구 이름을 입력해야 버튼이 켜져야 해서 재료(AlertDialog)로 조합했다.
 */
export function RestoreDialog({ backup, open, onOpenChange }: { backup: BackupFile; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { household, members } = useHousehold();
  const mutate = useMutate();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);

  const summary = summarizeBackup(backup);
  const memberMismatch = summary.memberCount !== members.length;
  const ready = typed.trim() === household.name && !memberMismatch;

  async function handleRestore() {
    setPending(true);
    const result = await mutate(() => restoreBackup(backup), { success: "백업으로 복원했습니다" });
    setPending(false);
    if (result.ok) onOpenChange(false);
  }

  const range =
    summary.firstMonth && summary.lastMonth
      ? `${summary.monthCount}개월 · ${formatYm(summary.firstMonth)} ~ ${formatYm(summary.lastMonth)}`
      : "기록된 달 없음";

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>백업으로 교체할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            현재 가구의 모든 재무 데이터가 이 백업 내용으로 <strong className="font-semibold text-foreground">교체</strong>됩니다. 되돌릴 수
            없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="flex flex-col gap-2 rounded-xl bg-secondary px-4 py-3 text-sm">
          <SummaryRow label="내보낸 시각" value={summary.exportedAt} />
          <SummaryRow label="가구" value={summary.householdName} />
          <SummaryRow label="기록" value={range} />
          <SummaryRow label="자산 · 부채" value={`${summary.assetCount}개 · ${summary.liabilityCount}개`} />
        </dl>

        {memberMismatch ? (
          <p role="alert" className="text-sm text-destructive">
            백업의 구성원 수({summary.memberCount}명)가 현재 가구({members.length}명)와 달라 복원할 수 없습니다.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              복원하기 전에 지금 데이터를 먼저 내보내 두세요.{" "}
              <Button
                variant="link"
                className="text-sm"
                loading={exporting}
                onClick={async () => {
                  setExporting(true);
                  await downloadBackup();
                  setExporting(false);
                }}
              >
                현재 데이터 내보내기
              </Button>
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="restore-confirm">
                확인을 위해 가구 이름({household.name})을 입력하세요
              </Label>
              <Input
                id="restore-confirm"
                value={typed}
                autoComplete="off"
                placeholder={household.name}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          </>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
          <Button variant="destructive" loading={pending} disabled={!ready} onClick={handleRestore}>
            교체하기
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

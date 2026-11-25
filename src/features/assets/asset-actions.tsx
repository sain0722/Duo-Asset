"use client";

import { Archive, ArchiveRestore, Ellipsis, HandCoins, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { history, latestMonth } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { clearSnapshotOrEntry, deleteRow, updateRow } from "@/lib/data/mutations";
import { EMPTY_MONTH_DATA } from "@/lib/data/types";
import type { Asset, AssetLine } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";

import { AssetCloseDialog, AssetValueDialog } from "./asset-dialogs";
import { AssetFormDialog } from "./asset-form-dialog";

type Dialog = "edit" | "value" | "close" | "archive" | "delete" | null;

/** 자산 상세의 동작: 이번 달 값 수정(주 버튼) + 나머지는 ⋯ 메뉴 */
export function AssetActions({ asset, line, onDeleted }: { asset: Asset; line: AssetLine | null; onDeleted: () => void }) {
  const data = useHousehold();
  const mutate = useMutate();
  const latest = latestMonth(data);
  const [dialog, setDialog] = useState<Dialog>(null);
  // 폼 다이얼로그는 열 때마다 새로 그려 최신 값으로 채운다
  const [formKey, setFormKey] = useState(0);

  function open(next: Exclude<Dialog, null>) {
    setFormKey((key) => key + 1);
    setDialog(next);
  }
  const onOpenChange = (next: boolean) => !next && setDialog(null);

  const hasValue = line !== null && line.value !== 0;
  const linkedGoals = data.goalAllocations.filter((allocation) => allocation.asset_id === asset.id).length;

  function requestDelete() {
    const earlier = history(data)
      .slice(0, -1)
      .some((point) => point.report.assetLines.some((l) => l.assetId === asset.id));
    if (earlier) {
      toast("지난 기록이 있어 삭제할 수 없습니다", {
        description: hasValue ? "해지·매각으로 0원을 기록하면 보관됩니다." : "보관하면 목록에서 접혀 보입니다.",
      });
      return;
    }
    if (data.planItems.some((item) => item.asset_id === asset.id) || data.liabilities.some((l) => l.withdraw_asset_id === asset.id)) {
      toast("저축 계획이나 부채의 출금 계좌로 쓰이고 있어 삭제할 수 없습니다", { description: "연결을 먼저 바꾸거나 보관해 주세요." });
      return;
    }
    open("delete");
  }

  async function remove() {
    const snapshot = latest
      ? (data.monthData[latest.id] ?? EMPTY_MONTH_DATA).assetSnapshots.find((s) => s.asset_id === asset.id)
      : undefined;
    const result = await mutate(
      async () => {
        // 이번 달에 처음 적은 값만 있는 자산: 기록을 먼저 지워야 자산을 지울 수 있다
        if (snapshot) await clearSnapshotOrEntry("asset_snapshots", snapshot.id);
        await deleteRow("assets", asset.id);
      },
      { success: "자산을 삭제했습니다" },
    );
    if (result.ok) onDeleted();
    else throw new Error("삭제 실패");
  }

  async function setActive(isActive: boolean) {
    const result = await mutate(() => updateRow<Asset>("assets", asset, { is_active: isActive }), {
      success: isActive ? "보관을 해제했습니다" : "보관했습니다",
    });
    if (!result.ok) throw new Error("보관 실패");
  }

  return (
    <>
      <Button variant="secondary" onClick={() => open("value")}>
        {latest ? `${formatMonthOnly(latest.month)} 값 수정` : "값 수정"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="더 보기">
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => open("edit")}>
            <Pencil aria-hidden />
            정보 수정
          </DropdownMenuItem>
          {asset.is_active && hasValue && (
            <DropdownMenuItem onSelect={() => open("close")}>
              <HandCoins aria-hidden />
              해지·매각
            </DropdownMenuItem>
          )}
          {asset.is_active && !hasValue && (
            <DropdownMenuItem onSelect={() => open("archive")}>
              <Archive aria-hidden />
              보관
            </DropdownMenuItem>
          )}
          {!asset.is_active && (
            <DropdownMenuItem onSelect={() => void setActive(true).catch(() => undefined)}>
              <ArchiveRestore aria-hidden />
              보관 해제
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={requestDelete}>
            <Trash2 aria-hidden />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AssetFormDialog key={`edit-${formKey}`} open={dialog === "edit"} onOpenChange={onOpenChange} asset={asset} />
      <AssetValueDialog key={`value-${formKey}`} open={dialog === "value"} onOpenChange={onOpenChange} asset={asset} line={line} />
      {line && (
        <AssetCloseDialog key={`close-${formKey}`} open={dialog === "close"} onOpenChange={onOpenChange} asset={asset} line={line} />
      )}
      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={onOpenChange}
        title="이 자산을 보관할까요?"
        description="목록 아래 ‘보관한 자산’으로 옮겨집니다. 지난 기록은 그대로 남습니다."
        confirmLabel="보관"
        onConfirm={() => setActive(false)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={onOpenChange}
        title="이 자산을 삭제할까요?"
        description={
          linkedGoals > 0
            ? `목표 ${linkedGoals}개에 배정한 금액도 함께 지워집니다. 되돌릴 수 없습니다.`
            : "이번 달 기록과 함께 지워지며 되돌릴 수 없습니다."
        }
        confirmLabel="삭제"
        destructive
        onConfirm={remove}
      />
    </>
  );
}

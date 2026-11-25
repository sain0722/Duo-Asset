"use client";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Ellipsis, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { InfoTip } from "@/components/info-tip";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { deleteRow, updateRow } from "@/lib/data/mutations";
import { GOAL_BASIS_LABELS } from "@/lib/finance/meta";
import type { Goal, GoalProgress, Won } from "@/lib/finance/types";
import { formatDate, formatPercent, formatYm } from "@/lib/format";
import { currentYm, diffMonths, ymOfDateString } from "@/lib/month";

import { nextSortOrder, reorderGoals } from "./goal-ops";

type GoalCardProps = {
  goal: Goal;
  progress: GoalProgress;
  /** 이 목표보다 먼저 배정받는 목표들 (부족 원인 안내용) */
  earlier: GoalProgress[];
  isFirst: boolean;
  isLast: boolean;
  assetValues: Record<string, Won>;
  onEdit: () => void;
};

export function GoalCard({ goal, progress, earlier, isFirst, isLast, assetValues, onEdit }: GoalCardProps) {
  const data = useHousehold();
  const mutate = useMutate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assetName = (id: string) => data.assets.find((asset) => asset.id === id)?.name ?? "삭제된 자산";
  const linkedIds = new Set(progress.allocations.map((a) => a.assetId));
  const sharedWithEarlier = earlier.some((other) => other.allocations.some((a) => linkedIds.has(a.assetId)));
  const monthsLeft = goal.target_date === null ? null : diffMonths(currentYm(), ymOfDateString(goal.target_date));

  async function move(direction: -1 | 1) {
    const changes = reorderGoals(data.goals, goal.id, direction);
    await mutate(async () => {
      for (const change of changes) await updateRow<Goal>("goals", change.goal, { sort_order: change.sort_order });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{goal.name}</CardTitle>
        <CardDescription>{GOAL_BASIS_LABELS[goal.basis]} 기준</CardDescription>
        <CardAction className="flex items-center gap-1">
          {progress.achieved && <Badge variant="brand">달성</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${goal.name} 메뉴`} className="-mr-2 text-muted-foreground">
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden />
                수정
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isFirst} onSelect={() => move(-1)}>
                <ArrowUp aria-hidden />
                우선순위 올리기
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onSelect={() => move(1)}>
                <ArrowDown aria-hidden />
                우선순위 내리기
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  mutate(() => updateRow<Goal>("goals", goal, { is_archived: true }), { success: "목표를 보관했습니다" })
                }
              >
                <Archive aria-hidden />
                보관
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Money amount={progress.current} className="num-display text-2xl font-bold" />
            <span className="text-sm text-muted-foreground">
              / <Money amount={progress.target} compact />
            </span>
          </p>
          <Progress value={progress.percent} aria-label={`${goal.name} 달성률`} />
          <p className="flex justify-between gap-3 text-sm">
            <span className="font-semibold text-brand tabular-nums">{formatPercent(progress.percent)}</span>
            {!progress.achieved && (
              <span className="text-muted-foreground">
                남은 금액 <Money amount={progress.remaining} compact className="font-medium text-foreground" />
              </span>
            )}
          </p>
        </div>

        {!progress.achieved && (
          <dl className="flex flex-col gap-2.5 border-t pt-4 text-sm">
            {goal.target_date && (
              <Row label={<>목표일 {formatDate(goal.target_date)}</>}>
                {monthsLeft !== null && monthsLeft < 0 ? (
                  <span className="text-warning-foreground">목표일이 지났습니다</span>
                ) : monthsLeft === 0 ? (
                  <span className="text-warning-foreground">이번 달이 목표일입니다</span>
                ) : progress.requiredMonthly !== null ? (
                  <span className="inline-flex items-center gap-1">
                    월 <Money amount={progress.requiredMonthly} compact className="font-semibold" /> 필요
                    <InfoTip title="목표일까지 필요한 월 적립액">
                      남은 금액을 목표일까지 남은 개월 수로 나눈 금액입니다(올림).
                    </InfoTip>
                  </span>
                ) : null}
              </Row>
            )}
            <Row
              label={
                <span className="inline-flex items-center gap-1">
                  예상 달성
                  <InfoTip title="예상 달성 시점">
                    순자산·금융자산 목표는 기본 시나리오 시뮬레이션에서 처음 목표를 넘는 달입니다. 그 밖의 목표는 남은
                    금액 ÷ 월 적립 계획(올림)개월 뒤입니다.
                  </InfoTip>
                </span>
              }
            >
              {progress.expectedMonth ? (
                <span className="font-semibold">{formatYm(progress.expectedMonth)}</span>
              ) : goal.basis === "net_worth" || goal.basis === "financial_assets" ? (
                <span className="text-muted-foreground">시뮬레이션 기간 안에는 어렵습니다</span>
              ) : (
                <span className="text-muted-foreground">월 적립 계획을 넣으면 계산됩니다</span>
              )}
            </Row>
            {goal.monthly_contribution !== null && goal.basis !== "net_worth" && goal.basis !== "financial_assets" && (
              <Row label="월 적립 계획">
                <Money amount={goal.monthly_contribution} compact />
              </Row>
            )}
          </dl>
        )}

        {goal.basis === "linked" && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">연결한 자산</p>
            {progress.allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                아직 연결한 자산이 없습니다.{" "}
                <Button variant="link" className="text-sm" onClick={onEdit}>
                  자산 연결
                </Button>
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {progress.allocations.map((allocation) => (
                  <li key={allocation.assetId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{assetName(allocation.assetId)}</span>
                    <span className="shrink-0 text-right">
                      <Money amount={allocation.allocated} compact className="font-semibold" />
                      <span className="ml-1.5 text-caption text-muted-foreground">
                        {allocation.requested === null ? (
                          "필요한 만큼"
                        ) : allocation.requested !== allocation.allocated ? (
                          <>
                            요청 <Money amount={allocation.requested} compact />
                          </>
                        ) : (
                          <>
                            / <Money amount={assetValues[allocation.assetId] ?? 0} compact />
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {progress.shortfall > 0 && (
              <p className="mt-1 flex gap-2 text-sm text-warning-foreground">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {sharedWithEarlier ? "다른 목표에 먼저 배정되어" : "자산 평가금액이 요청보다 적어"}{" "}
                  <Money amount={progress.shortfall} compact className="font-semibold" /> 부족
                </span>
              </p>
            )}
          </div>
        )}

        {goal.memo && <p className="text-caption whitespace-pre-line text-muted-foreground">{goal.memo}</p>}
      </CardContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`'${goal.name}' 목표를 삭제할까요?`}
        description="연결한 자산 배정도 함께 지워집니다. 자산 자체는 그대로 남습니다. 나중에 다시 볼 수 있게 하려면 보관하세요."
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          await mutate(() => deleteRow("goals", goal.id), { success: "목표를 삭제했습니다" });
        }}
      />
    </Card>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground tabular-nums">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** 보관한 목표: 이름과 금액만 보여 주고 되살리거나 지운다 */
export function ArchivedGoalRow({ goal }: { goal: Goal }) {
  const data = useHousehold();
  const mutate = useMutate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-2 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-body font-medium">{goal.name}</p>
        <p className="text-caption text-muted-foreground">
          목표 <Money amount={goal.target_amount} compact />
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            mutate(
              // 되살린 목표는 맨 뒤(가장 나중에 배정)로 간다
              () =>
                updateRow<Goal>("goals", goal, {
                  is_archived: false,
                  sort_order: nextSortOrder(data.goals.filter((g) => !g.is_archived)),
                }),
              { success: "목표를 되살렸습니다" },
            )
          }
        >
          <ArchiveRestore aria-hidden />
          되살리기
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${goal.name} 삭제`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`'${goal.name}' 목표를 삭제할까요?`}
        description="삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          await mutate(() => deleteRow("goals", goal.id), { success: "목표를 삭제했습니다" });
        }}
      />
    </li>
  );
}

"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Money } from "@/components/money";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { basisText, currentPosition, goalsView, positionView } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import type { Goal } from "@/lib/finance/types";
import { currentYm } from "@/lib/month";
import { cn } from "@/lib/utils";

import { ArchivedGoalRow, GoalCard } from "./goal-card";
import { GoalDialog, type GoalPreset } from "./goal-dialog";
import { sortGoals } from "./goal-ops";

/** 빈 상태의 예시. 금액은 사용자가 정한다. */
const PRESETS: { label: string; preset: GoalPreset }[] = [
  { label: "비상금", preset: { name: "비상금", basis: "linked" } },
  { label: "입주 자금", preset: { name: "입주 자금", basis: "linked" } },
  { label: "순자산 목표", preset: { name: "순자산 목표", basis: "net_worth" } },
];

type DialogTarget = { mode: "create"; preset?: GoalPreset } | { mode: "edit"; goal: Goal };

export function GoalsPage() {
  const data = useHousehold();
  const view = goalsView(data, currentYm());
  const position = currentPosition(data);
  const basis = positionView(data)?.basis;
  // 닫히는 동안에도 내용이 바뀌지 않도록 대상은 남겨 두고, 열 때마다 폼을 새로 시작한다(key)
  const [dialog, setDialog] = useState<{ open: boolean; key: number; target: DialogTarget }>({
    open: false,
    key: 0,
    target: { mode: "create" },
  });
  const openDialog = (target: DialogTarget) => setDialog((prev) => ({ open: true, key: prev.key + 1, target }));
  const [showArchived, setShowArchived] = useState(false);

  const goalById = useMemo(() => new Map(data.goals.map((goal) => [goal.id, goal])), [data.goals]);
  const archived = sortGoals(data.goals.filter((goal) => goal.is_archived));
  const hasGoals = view.progress.length > 0;

  return (
    <PageContainer>
      <PageHeader
        title="목표"
        description="목표는 자산이 아니라 자산의 사용 목적입니다."
        actions={
          hasGoals && (
            <Button onClick={() => openDialog({ mode: "create" })}>
              <Plus aria-hidden />
              목표 추가
            </Button>
          )
        }
      />
      <SectionTabs items={SECTION_TABS.goals} aria-label="목표 메뉴" />

      <Card>
        <CardContent className="flex flex-col gap-5">
          <Stat
            size="lg"
            label="여유 가용자산"
            info={
              <InfoTip title="여유 가용자산">
                여유 가용자산 = 가용자산 − 가용자산 중 목표 몫. 목표에 배정하지 않고 남은 가용자산입니다. 목표를 만들어도
                총자산은 변하지 않습니다.
              </InfoTip>
            }
            value={<Money amount={view.freeLiquid} />}
            sub={basis && basisText(basis)}
          />
          <dl className="grid grid-cols-1 gap-2.5 border-t pt-4 text-sm sm:grid-cols-2 sm:gap-6">
            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
              <dt className="flex items-center gap-1 text-muted-foreground">
                가용자산
                <InfoTip title="가용자산">유동성이 &lsquo;즉시 사용 가능&rsquo;인 자산의 합입니다.</InfoTip>
              </dt>
              <dd className="font-semibold sm:text-lg">
                <Money amount={position.totals.liquid} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
              <dt className="flex items-center gap-1 text-muted-foreground">
                가용자산 중 목표 몫
                <InfoTip title="가용자산 중 목표 몫">
                  가용자산(즉시 사용 가능한 자산) 중 목표에 배정한 금액입니다. 가용자산에서 이 금액을 뺀 값이 여유
                  가용자산입니다. 즉시 사용할 수 없는 자산에 배정한 금액은 들어가지 않습니다. 한 자산을 여러 목표에
                  연결해도 위에 있는 목표부터 자산의 남은 평가금액 안에서만 배정하므로 합계가 평가금액을 넘지 않습니다.
                </InfoTip>
              </dt>
              <dd className="font-semibold sm:text-lg">
                <Money amount={view.allocatedLiquid} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {hasGoals ? (
        <section aria-labelledby="goal-list-title" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 id="goal-list-title" className="text-base font-semibold">
              진행 중 {view.progress.length}
            </h2>
            <p className="text-caption text-muted-foreground">위에 있는 목표부터 자산을 배정합니다</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            {view.progress.map((progress, index) => {
              const goal = goalById.get(progress.goalId);
              if (!goal) return null;
              return (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  progress={progress}
                  earlier={view.progress.slice(0, index)}
                  isFirst={index === 0}
                  isLast={index === view.progress.length - 1}
                  assetValues={position.assetValues}
                  onEdit={() => openDialog({ mode: "edit", goal })}
                />
              );
            })}
          </div>
        </section>
      ) : (
        <Card>
          <EmptyState
            title="아직 목표가 없어요"
            description="모으려는 돈을 목표로 정하면 지금 얼마나 모였고 언제 닿을지 알려 드려요."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {PRESETS.map(({ label, preset }) => (
                  <Button key={label} variant="secondary" onClick={() => openDialog({ mode: "create", preset })}>
                    {label}
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => openDialog({ mode: "create" })}>
                  <Plus aria-hidden />
                  직접 만들기
                </Button>
              </div>
            }
          />
        </Card>
      )}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <Button
            variant="ghost"
            className="self-start text-muted-foreground"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((open) => !open)}
          >
            보관한 목표 {archived.length}
            <ChevronDown aria-hidden className={cn("transition-transform", showArchived && "rotate-180")} />
          </Button>
          {showArchived && (
            <Card className="py-2 sm:py-2">
              <ul className="divide-y">
                {archived.map((goal) => (
                  <ArchivedGoalRow key={goal.id} goal={goal} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      <GoalDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        goal={dialog.target.mode === "edit" ? dialog.target.goal : null}
        preset={dialog.target.mode === "create" ? dialog.target.preset : undefined}
      />
    </PageContainer>
  );
}

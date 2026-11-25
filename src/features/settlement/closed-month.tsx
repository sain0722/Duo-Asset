"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Delta, Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canReopen, pocketName, pocketTone } from "@/lib/data/derive";
import { useMutate } from "@/lib/data/hooks";
import { reopenMonth } from "@/lib/data/mutations";
import type { HouseholdData } from "@/lib/data/types";
import type { MonthReport, MonthRow, PocketId } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatDate, formatMonthOnly } from "@/lib/format";

import { assetValueChange, liabilityChange } from "./model";
import { ResultBody } from "./result-panel";

/** 마감된 달: 마감 때 동결한 결과만 보여 준다. */
export function ClosedMonthView({ data, month, report }: { data: HouseholdData; month: MonthRow; report: MonthReport }) {
  const mutate = useMutate();
  const [confirming, setConfirming] = useState(false);
  const label = formatMonthOnly(month.month);
  const reopenable = canReopen(data, month);

  async function handleReopen() {
    const result = await mutate(() => reopenMonth(month), { success: `${label} 정산을 다시 열었습니다` });
    if (!result.ok) throw new Error("다시 열지 못했습니다");
  }

  const pockets: PocketId[] = [...data.members.map((member) => member.id), JOINT];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock aria-hidden className="size-4" />
            {month.closed_at ? `${formatDate(month.closed_at)} 마감` : "마감"} · 마감 당시 결과를 그대로 보여 줍니다.
          </p>
          {reopenable && (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              마감 취소
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{report.isBaseline ? "출발점" : `${label} 결과`}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultBody data={data} report={report} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>이 달의 기록</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          {!report.isBaseline && (
            <RecordGroup title="수입·이동">
              {report.incomeLines.map((line) => (
                <RecordRow key={line.key} label={line.name} badge={<Pocket data={data} pocket={line.pocket} />} amount={<Money amount={line.actual} />} />
              ))}
              {report.contributionLines.map((line) => (
                <RecordRow
                  key={line.key}
                  label={`${pocketName(data, line.pocket)} → 공용통장`}
                  amount={<Money amount={line.actual} />}
                />
              ))}
              {report.transferLines.map((line) => (
                <RecordRow
                  key={line.entryId}
                  label={`${pocketName(data, line.from)} → ${pocketName(data, line.to)}`}
                  amount={<Money amount={line.amount} />}
                />
              ))}
            </RecordGroup>
          )}
          <RecordGroup title="잔액">
            {pockets.flatMap((pocket) =>
              report.assetLines
                .filter((line) => line.pocket === pocket)
                .map((line) => (
                  <RecordRow
                    key={line.assetId}
                    label={line.name}
                    badge={<Pocket data={data} pocket={line.pocket} />}
                    amount={
                      <span className="flex flex-col items-end">
                        <Money amount={line.value} />
                        {!report.isBaseline && <Delta amount={assetValueChange(line)} compact className="text-caption" />}
                      </span>
                    }
                  />
                )),
            )}
            {report.liabilityLines.map((line) => (
              <RecordRow
                key={line.liabilityId}
                label={line.name}
                badge={<span className="text-caption text-muted-foreground">부채</span>}
                amount={
                  <span className="flex flex-col items-end">
                    <Money amount={line.balance} />
                    {!report.isBaseline && <Delta amount={liabilityChange(line)} compact className="text-caption" />}
                  </span>
                }
              />
            ))}
          </RecordGroup>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${label} 마감을 취소할까요?`}
        description="다시 열면 이 달의 입력을 고칠 수 있습니다. 계획은 마감 당시 값을 그대로 씁니다. 다시 마감할 때까지 다음 달의 월초 잔액도 바뀔 수 있습니다."
        confirmLabel="마감 취소"
        cancelLabel="닫기"
        onConfirm={handleReopen}
      />
    </div>
  );
}

function Pocket({ data, pocket }: { data: HouseholdData; pocket: PocketId }) {
  return (
    <PocketBadge tone={pocketTone(data, pocket)} className="text-caption font-normal text-muted-foreground">
      {pocketName(data, pocket)}
    </PocketBadge>
  );
}

function RecordGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h4 className="mb-1 text-sm font-semibold">{title}</h4>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function RecordRow({ label, badge, amount }: { label: string; badge?: React.ReactNode; amount: React.ReactNode }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-body">{label}</span>
        {badge}
      </span>
      <span className="shrink-0 text-right text-body font-medium">{amount}</span>
    </li>
  );
}

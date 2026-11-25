"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { pocketName } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import { EVENT_KIND_LABELS, pocketOf } from "@/lib/finance/meta";
import type { FutureEvent, Scenario, Ym } from "@/lib/finance/types";
import { formatYm } from "@/lib/format";
import { compareYm } from "@/lib/month";
import { cn } from "@/lib/utils";

import { EventDialog } from "./event-dialog";
import { describeEvent } from "./event-text";

type EventsPanelProps = {
  scenario: Scenario;
  /** 시뮬레이션 첫 달. 이보다 앞선 이벤트는 일회성 효과가 빠진다 */
  startMonth: Ym;
  onToggle: (event: FutureEvent, included: boolean) => void;
};

export function EventsPanel({ scenario, startMonth, onToggle }: EventsPanelProps) {
  const data = useHousehold();
  const [dialog, setDialog] = useState<{ open: boolean; key: number; event: FutureEvent | null }>({ open: false, key: 0, event: null });
  const openDialog = (event: FutureEvent | null) => setDialog((d) => ({ open: true, key: d.key + 1, event }));

  const events = data.events
    .filter((event) => event.scenario_id === null || event.scenario_id === scenario.id)
    .sort((a, b) => compareYm(a.month, b.month) || a.created_at.localeCompare(b.created_at));
  const who = (memberId: string | null) => pocketName(data, pocketOf(memberId));
  const loanName = (id: string) =>
    data.liabilities.find((l) => l.id === id)?.name ?? data.events.find((e) => e.id === id)?.name ?? "삭제된 대출";

  return (
    <Card>
      <CardHeader>
        <CardTitle>미래 이벤트</CardTitle>
        <CardDescription>정해진 달부터 반영됩니다.</CardDescription>
        <CardAction>
          <Button variant="secondary" size="sm" onClick={() => openDialog(null)}>
            <Plus aria-hidden />
            추가
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {events.length === 0 ? (
          <EmptyState
            className="py-6"
            title="등록한 이벤트가 없어요"
            description="입주, 이직, 출산처럼 앞으로 있을 일을 넣으면 그 달부터 반영해 보여 드려요."
          />
        ) : (
          <ul className="-mx-2 flex flex-col">
            {events.map((event) => {
              const common = event.scenario_id === null;
              const included = !common || !scenario.excluded_event_ids.includes(event.id);
              const past = compareYm(event.month, startMonth) < 0;
              return (
                <li key={event.id} className="flex items-center gap-2 border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openDialog(event)}
                    className={cn(
                      "flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left outline-none",
                      "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    )}
                  >
                    <span className={cn("min-w-0 flex-1", !included && "opacity-55")}>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-body font-medium">{event.name}</span>
                        {!common && <Badge variant="outline">이 시나리오만</Badge>}
                        {past && <Badge variant="neutral">지난 달</Badge>}
                      </span>
                      <span className="block text-caption text-muted-foreground tabular-nums">
                        {formatYm(event.month)} · {EVENT_KIND_LABELS[event.kind]}
                      </span>
                      <span className="block truncate text-caption text-muted-foreground tabular-nums">
                        {describeEvent(event, who, loanName)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  {common && (
                    <Switch
                      aria-label={`${event.name}을(를) 이 시나리오에 적용`}
                      checked={included}
                      onCheckedChange={(checked) => onToggle(event, checked)}
                      className="mr-2"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <ul className="flex list-disc flex-col gap-1 pl-4 text-caption text-muted-foreground">
          <li>공통 이벤트는 스위치로 이 시나리오에서만 끌 수 있습니다.</li>
          <li>이벤트가 현실이 되어 월급·지출 계획에 반영했다면, 이중으로 잡히지 않게 이벤트를 지우거나 끄세요.</li>
          <li>이미 지난 일회성 이벤트는 무시되고, 기간 이벤트는 끝날 때까지 적용됩니다.</li>
          <li>자동차 할부 종료처럼 등록한 부채가 끝나는 것은 넣지 않아도 자동으로 반영됩니다.</li>
        </ul>
      </CardContent>

      <EventDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        event={dialog.event}
        scenario={scenario}
        defaultMonth={startMonth}
      />
    </Card>
  );
}

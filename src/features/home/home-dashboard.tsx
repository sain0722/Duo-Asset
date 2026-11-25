"use client";

import { useMemo } from "react";

import { PageContainer, PageHeader } from "@/components/page";
import { goalsView, history, planForMonth } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import { todayInSeoul, ymOfDateString } from "@/lib/month";

import {
  heroView,
  isUpcomingEmpty,
  lastSettlement,
  settlementNotice,
  setupChecklist,
  upcoming,
} from "./home-model";
import { PlanCard, ResultCard } from "./month-cards";
import { NetWorthHero } from "./net-worth-hero";
import { SettlementNoticeLink, SetupChecklist } from "./setup";
import { TrendCard } from "./trend-card";
import { UpcomingCard } from "./upcoming-card";

/*
 * 모바일은 한 열에서 중요한 순서(order-*)로. PC 는 왼쪽(히어로·추이)이 주, 오른쪽(계획·결과)이 보조이고
 * 다가오는 일은 아래에 가로로 펼친다.
 * 두 열 묶음은 모바일에서 display: contents 로 풀어 순서를 한 줄로 다시 맞춘다.
 */
export function HomeDashboard() {
  const data = useHousehold();
  const today = todayInSeoul();
  const now = ymOfDateString(today);

  const view = useMemo(() => {
    const plan = planForMonth(data, now);
    const goals = goalsView(data, now);
    return {
      hero: heroView(data),
      goals,
      plan,
      notice: settlementNotice(data, today),
      checklist: setupChecklist(data),
      result: lastSettlement(data),
      points: history(data),
      upcoming: upcoming(data, { today, plan, goals }),
    };
  }, [data, now, today]);

  const heroReplaced = view.checklist !== null && data.assets.length === 0;

  return (
    <PageContainer>
      <PageHeader title={data.household.name} />
      <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-5">
          {heroReplaced || !view.hero ? (
            view.checklist && <SetupChecklist steps={view.checklist} className="order-1 lg:order-none" />
          ) : (
            <>
              <NetWorthHero hero={view.hero} freeLiquid={view.goals.freeLiquid} className="order-1 lg:order-none" />
              {view.checklist ? (
                <SetupChecklist steps={view.checklist} className="order-2 lg:order-none" />
              ) : (
                view.notice && <SettlementNoticeLink notice={view.notice} className="order-2 lg:order-none" />
              )}
            </>
          )}
          {!heroReplaced && <TrendCard points={view.points} className="order-5 lg:order-none" />}
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          {/* 계획이 비었으면 체크리스트의 "월급·배분 설정" 단계와 겹치므로 숨긴다 */}
          {!(view.checklist && view.plan.lines.length === 0) && (
            <PlanCard data={data} plan={view.plan} className="order-3 lg:order-none" />
          )}
          {!heroReplaced && <ResultCard result={view.result} className="order-4 lg:order-none" />}
        </div>
        {!isUpcomingEmpty(view.upcoming) && (
          <UpcomingCard data={data} upcoming={view.upcoming} className="order-6 lg:order-none lg:col-span-3" />
        )}
      </div>
    </PageContainer>
  );
}

import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** 문구는 docs/finance-rules.md 4절(지표 정의)과 맞춘다. 규칙이 바뀌면 함께 고친다. */
const METRICS: { name: string; formula?: string; body: string }[] = [
  { name: "총자산", body: "자산 평가금액의 합입니다." },
  { name: "총부채", body: "부채 남은 원금의 합입니다." },
  { name: "순자산", formula: "총자산 − 총부채", body: "총자산에서 총부채를 뺀 금액입니다." },
  { name: "가용자산", body: "유동성이 '즉시 사용 가능'인 자산의 합입니다." },
  { name: "수입", body: "실제로 받은 현금 수입입니다. 비현금 복지(식비 카드 등)는 포함하지 않습니다." },
  {
    name: "소비지출",
    formula: "수입 − 자산 순투입 합 − 부채 순상환 합",
    body: "이자, 용돈, 생활비 등 가구 밖으로 나간 모든 돈입니다. 계좌 간 이체, 공용통장 납입, 적금 납입은 소비가 아닙니다.",
  },
  {
    name: "저축액",
    formula: "수입 − 소비지출 − 원금 상환액 = 자산 순투입 합 − 신규 차입",
    body: "자산에 새로 넣은 돈입니다. 투자 평가손익은 포함하지 않습니다.",
  },
  { name: "저축률", formula: "저축액 ÷ 수입", body: "%로 소수 1자리까지 표시합니다. 수입이 0이면 표시하지 않습니다." },
  {
    name: "원금 상환액",
    body: "부채 잔액 합계가 줄어든 만큼입니다(늘었으면 0). 늘어난 만큼은 신규 차입입니다. 대환처럼 갚고 새로 빌린 달은 가구 순액으로 봅니다.",
  },
  {
    name: "평가손익",
    formula: "평가금액 변화 − 순투입",
    body: "투자 평가손익은 주식·투자, 퇴직연금·연금 자산의 평가손익 합입니다. 부동산·자동차 등 그 외 자산의 변동은 기타 평가 변동으로 따로 봅니다.",
  },
  {
    name: "기초 조정",
    formula: "뒤늦게 등록한 기존 자산 − 기존 부채",
    body: "전부터 있던 자산·부채를 나중에 등록한 금액입니다. 수입·저축 계산에는 영향을 주지 않습니다.",
  },
];

export function MetricsGlossary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>지표 설명</CardTitle>
        <CardDescription>화면의 숫자가 어떻게 계산되는지</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="-my-1 divide-y">
          {METRICS.map((metric) => (
            <details key={metric.name} className="group">
              <summary className="-mx-2 flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 text-body font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                {metric.name}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="flex flex-col gap-1.5 pt-1 pb-4 text-sm leading-relaxed">
                {metric.formula && <p className="font-medium">{metric.formula}</p>}
                <p className="text-muted-foreground">{metric.body}</p>
              </div>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

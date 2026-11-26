import { InfoTip } from "@/components/info-tip";

/** 지표 정의. 문구는 docs/finance-rules.md 4·5절과 맞춘다. */
const DEFINITIONS = {
  income: ["수입", "실제로 받은 현금 수입입니다. 비현금 복지(식비 카드 등)는 포함하지 않습니다."],
  consumption: ["소비지출", "수입 − 자산 순투입 합 − 부채 순상환 합. 이자, 용돈, 생활비 등 가구 밖으로 나간 모든 돈입니다."],
  savings: ["실제 저축액", "수입 − 소비지출 − 원금 상환액 (= 자산 순투입 합 − 신규 차입). 투자 평가손익은 포함하지 않습니다."],
  savingsRate: ["저축률", "저축액 ÷ 수입 (%, 소수 1자리). 수입이 0이면 표시하지 않습니다."],
  principalRepaid: ["원금 상환액", "부채 잔액 합계가 줄어든 만큼입니다 (늘었으면 0)."],
  newBorrowing: ["신규 차입", "부채 잔액 합계가 늘어난 만큼입니다 (줄었으면 0)."],
  investmentGain: ["투자 평가손익", "주식·투자, 퇴직연금·연금 자산의 평가손익 합입니다. 평가손익 = 평가금액 변화 − 순투입."],
  otherValuation: ["기타 평가 변동", "그 외 자산(부동산, 자동차 등)의 평가손익 합입니다."],
  adjustment: ["기초 조정", "뒤늦게 등록한 기존 자산 − 기존 부채. 수입·저축 계산에 영향을 주지 않습니다."],
  netWorth: ["순자산", "총자산 − 총부채."],
  achievement: ["저축 목표 달성률", "실제 저축액 ÷ 계획 저축액."],
  pocketConsumption: [
    "주머니 소비",
    "주머니 수입 + 들어온 이동 − 나간 이동 − 주머니 자산 순투입 − 주머니 부채 순상환. 주머니 소비의 합은 가구 소비지출과 같습니다.",
  ],
  unclassified: [
    "미분류 지출",
    "주머니 소비 중 확인한 지출(지출 항목 + 확인된 이자)을 뺀 나머지입니다. 개인 주머니에서는 개인 생활비, 공동 주머니에서는 공동생활비입니다.",
  ],
  principal: ["순투입액", "지금까지 넣은 돈 − 뺀 돈. 이번 달 순입금만큼 늘어나고, 평가금액 변화에서 순입금을 뺀 나머지가 평가손익이 됩니다."],
} as const;

export type MetricId = keyof typeof DEFINITIONS;

export function MetricTip({ id }: { id: MetricId }) {
  const [title, body] = DEFINITIONS[id];
  return <InfoTip title={title}>{body}</InfoTip>;
}

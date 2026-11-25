import { InfoTip } from "@/components/info-tip";

/* 지표 정의. 문구는 docs/finance-rules.md 4·6·9절과 맞춘다. */

export const NetWorthTip = () => (
  <InfoTip title="순자산">총자산 − 총부채. 비현금 복지는 포함하지 않습니다.</InfoTip>
);

export const AssetsTip = () => <InfoTip title="총자산">자산 평가금액의 합입니다.</InfoTip>;

export const LiabilitiesTip = () => <InfoTip title="총부채">부채 남은 원금의 합입니다.</InfoTip>;

export const LiquidTip = () => (
  <InfoTip title="가용자산">
    유동성이 &lsquo;즉시 사용 가능&rsquo;인 자산의 합입니다. 목표 배정 후 여유는 가용자산에서 가용자산에 걸린 목표
    배정액을 뺀 금액입니다.
  </InfoTip>
);

export const PlanIncomeTip = () => (
  <InfoTip title="합산 월수입">
    이번 달 계획에 잡힌 부부의 현금 수입 합계입니다. 비현금 복지(식비 카드 등)는 포함하지 않습니다.
  </InfoTip>
);

export const PlanSavingsTip = () => (
  <InfoTip title="예상 저축액">
    계획 저축 = 수입 − 계획 소비 − 계획 원금상환. 개인 사용 가능 금액은 모두 쓰는 돈으로 봅니다.
  </InfoTip>
);

export const AllowanceTip = () => (
  <InfoTip title="개인 사용 가능 금액">
    현금 수입 − 개인 고정지출 − 개인 부채 상환(원금+이자) − 공용통장 납입 − 개인 저축.
  </InfoTip>
);

export const JointBudgetTip = () => (
  <InfoTip title="공동생활비 예산">
    공용통장에서 쓰기로 한 공동지출과 공동 부채 이자의 합입니다. 공동 적금 이체는 소비가 아닙니다.
  </InfoTip>
);

export const SavingsTip = () => (
  <InfoTip title="저축액">
    수입 − 소비지출 − 원금 상환액 = Σ자산 순투입 − 신규 차입. 투자 평가손익은 포함하지 않습니다.
  </InfoTip>
);

export const AchievementTip = () => <InfoTip title="저축 목표 달성률">실제 저축액 ÷ 계획 저축액.</InfoTip>;

export const SavingsRateTip = () => (
  <InfoTip title="저축률">저축액 ÷ 수입 (%, 소수 1자리). 수입이 0이면 표시하지 않습니다.</InfoTip>
);

export const JointActualTip = () => (
  <InfoTip title="공동생활비">
    공동 주머니 소비 = 수입 + 들어온 이동 − 나간 이동 − 자산 순투입 − 부채 순상환. 예산은 그 달 계획의 공동지출과
    이자입니다.
  </InfoTip>
);

export const InvestmentGainTip = () => (
  <InfoTip title="투자 평가손익">
    주식·투자, 퇴직연금·연금 자산의 평가손익 합입니다. 평가손익 = 평가금액 변화 − 순투입.
  </InfoTip>
);

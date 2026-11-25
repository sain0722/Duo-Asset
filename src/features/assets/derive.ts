/**
 * 자산 화면 전용 파생 값. 순수 함수만 둔다 (React·Supabase import 금지).
 * 재무 지표의 정의는 lib/finance 를 따르고, 여기서는 화면에 맞게 묶고 고르기만 한다.
 */
import { ASSET_KINDS, ASSET_KIND_ORDER, percentOf } from "@/lib/finance";
import type { Asset, AssetKind, AssetLine, BalanceTotals, PocketId, Won } from "@/lib/finance/types";
import type { HistoryPoint } from "@/lib/data/derive";
import { pocketOf } from "@/lib/finance/meta";

// ───────────────────────── 평가손익 ─────────────────────────

export interface Valuation {
  /** 누적 평가손익 = 평가금액 − 순투입액 */
  gain: Won;
  /** 수익률 % (소수 1자리). 순투입액이 0 이하이면 null */
  rate: number | null;
}

export function valuationOf(value: Won, principal: Won): Valuation {
  const gain = value - principal;
  return { gain, rate: percentOf(gain, principal) };
}

// ───────────────────────── 만기 ─────────────────────────

/** 'YYYY-MM-DD' 두 날짜 사이의 일수 (date − today) */
export function daysUntil(date: string, today: string): number {
  const toUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000);
}

/** 30 → "D-30", 0 → "D-day", −3 → "D+3" */
export function ddayLabel(days: number): string {
  if (days === 0) return "D-day";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

// ───────────────────────── 구성 ─────────────────────────

/**
 * 자산 구성 묶음. 차트 계열은 6개를 넘지 않아야 하므로 유형 10개를 6묶음으로 고정한다.
 * 순서가 곧 색(chart-1..6)이다. 필터·금액 순서로 바꾸지 않는다.
 */
export const COMPOSITION_GROUPS = [
  { id: "cash", label: "현금·예적금", kinds: ["cash", "deposit", "savings"] },
  { id: "investment", label: "투자", kinds: ["investment"] },
  { id: "pension", label: "연금", kinds: ["pension"] },
  { id: "housing", label: "부동산·분양", kinds: ["real_estate", "presale"] },
  { id: "lease", label: "보증금", kinds: ["lease_deposit"] },
  { id: "other", label: "자동차·기타", kinds: ["vehicle", "other"] },
] as const satisfies readonly { id: string; label: string; kinds: readonly AssetKind[] }[];

export type CompositionGroupId = (typeof COMPOSITION_GROUPS)[number]["id"];

export interface CompositionPart {
  id: CompositionGroupId;
  label: string;
  /** 0-based 계열 순서 (색) */
  index: number;
  amount: Won;
  /** 총자산 대비 % (소수 1자리). 총자산이 0 이하이면 null */
  percent: number | null;
}

/** 유형별 합계(BalanceTotals.byKind)를 6묶음으로. 금액이 0인 묶음도 순서를 지키려고 남긴다. */
export function compositionOf(byKind: BalanceTotals["byKind"]): CompositionPart[] {
  const amounts = COMPOSITION_GROUPS.map((group) =>
    group.kinds.reduce((total, kind) => total + (byKind[kind] ?? 0), 0),
  );
  // 음수(마이너스 통장 등)는 막대 폭에 쓸 수 없으므로 비율의 분모에서 뺀다
  const whole = amounts.reduce((total, amount) => total + Math.max(amount, 0), 0);
  return COMPOSITION_GROUPS.map((group, index) => ({
    id: group.id,
    label: group.label,
    index,
    amount: amounts[index],
    percent: percentOf(Math.max(amounts[index], 0), whole),
  }));
}

export type CompositionRow = { month: string } & Record<CompositionGroupId, Won>;

/** 월별 자산 구성 (누적 막대용) */
export function compositionHistory(points: HistoryPoint[]): CompositionRow[] {
  return points.map((point) => {
    const row = { month: point.month } as CompositionRow;
    for (const part of compositionOf(point.report.closing.byKind)) row[part.id] = part.amount;
    return row;
  });
}

// ───────────────────────── 목록 ─────────────────────────

export type PocketFilter = PocketId | "all";

export interface AssetRow {
  asset: Asset;
  /** 가장 최근 달의 자산 줄. 집계에서 빠진 자산(보관 후 0원)은 null */
  line: AssetLine | null;
}

export interface AssetGroup {
  kind: AssetKind;
  label: string;
  /** 이 묶음(필터 적용 후) 평가금액 합 */
  total: Won;
  rows: AssetRow[];
}

/** 유형별로 묶은 사용 중 자산과, 따로 접어 둘 보관 자산 */
export function groupAssets(
  assets: Asset[],
  lines: AssetLine[],
  filter: PocketFilter,
): { groups: AssetGroup[]; archived: AssetRow[] } {
  const lineById = new Map(lines.map((line) => [line.assetId, line]));
  const rows = assets
    .filter((asset) => filter === "all" || pocketOf(asset.owner_member_id) === filter)
    .toSorted((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((asset) => ({ asset, line: lineById.get(asset.id) ?? null }));

  const active = rows.filter((row) => row.asset.is_active);
  const groups = ASSET_KIND_ORDER.flatMap((kind) => {
    const inKind = active.filter((row) => row.asset.kind === kind);
    if (inKind.length === 0) return [];
    return [
      {
        kind,
        label: ASSET_KINDS[kind].label,
        total: inKind.reduce((total, row) => total + (row.line?.value ?? 0), 0),
        rows: inKind,
      },
    ];
  });
  return { groups, archived: rows.filter((row) => !row.asset.is_active) };
}

// ───────────────────────── 이력 ─────────────────────────

export interface AssetHistoryRow {
  month: string;
  /** 열린 달 (잠정) */
  provisional: boolean;
  isBaseline: boolean;
  /** 그 달 스냅샷이 있는가. false 면 값은 전월 값을 가정한 것 */
  confirmed: boolean;
  value: Won;
  principal: Won;
  contributed: Won;
  gain: Won;
  adjustment: Won;
}

/** 한 자산의 월별 기록 (오름차순). 그 달 정산에 없던 달은 뺀다. */
export function assetHistory(points: HistoryPoint[], assetId: string): AssetHistoryRow[] {
  return points.flatMap((point) => {
    const line = point.report.assetLines.find((candidate) => candidate.assetId === assetId);
    if (!line) return [];
    return [
      {
        month: point.month,
        provisional: point.provisional,
        isBaseline: point.report.isBaseline,
        confirmed: line.confirmed,
        value: line.value,
        principal: line.principal,
        contributed: line.contributed,
        gain: line.gain,
        adjustment: line.adjustment,
      },
    ];
  });
}

// ───────────────────────── 전월 대비 ─────────────────────────

/** 가장 최근 달 말과 직전 달 말(report.closing)의 차이. 직전 달이 없으면 null */
export function closingChange(points: HistoryPoint[], pick: (totals: BalanceTotals) => Won): Won | null {
  if (points.length < 2) return null;
  return pick(points[points.length - 1].report.closing) - pick(points[points.length - 2].report.closing);
}

// ───────────────────────── 해지·매각 ─────────────────────────

/**
 * 해지·매각할 때 이번 달에 기록할 스냅샷.
 * 평가금액은 0, 순투입액은 받은 금액만큼 줄인다 → 받은 금액과 장부 금액의 차이는 소비가 아니라 평가 변동이 된다.
 * 잔액형 자산은 순투입액 = 평가금액이므로 둘 다 0.
 * 이번 달에 이미 넣은 돈이 있을 수 있어 월초가 아니라 현재 순투입액에서 뺀다 (미확인이면 둘은 같다).
 */
export function disposalSnapshot(
  kind: AssetKind,
  line: Pick<AssetLine, "openValue" | "principal" | "contributed" | "openPrincipal">,
  received: Won,
): { value: Won; principal: Won; gain: Won } {
  const principal = ASSET_KINDS[kind].tracking === "balance" ? 0 : line.principal - received;
  const contributed = principal - line.openPrincipal;
  return { value: 0, principal, gain: 0 - line.openValue - contributed };
}

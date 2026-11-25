import type { BackupFile } from "@/lib/data/types";
import type { Ym } from "@/lib/finance/types";
import { TIME_ZONE } from "@/lib/month";

const ARRAY_KEYS = [
  "members",
  "assets",
  "liabilities",
  "planItems",
  "months",
  "assetSnapshots",
  "liabilitySnapshots",
  "monthEntries",
  "goals",
  "goalAllocations",
  "scenarios",
  "events",
] as const satisfies readonly (keyof BackupFile)[];

export type ParsedBackup = { ok: true; backup: BackupFile } | { ok: false; message: string };

/**
 * 선택한 파일의 글자를 백업으로 읽는다. 형식(app · formatVersion · 표 목록)만 확인한다.
 * 행 단위의 검증은 DB 함수(restore_backup)가 한 트랜잭션 안에서 한다.
 */
export function parseBackup(text: string): ParsedBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON 파일이 아닙니다. 설정에서 내보낸 백업 파일을 골라 주세요." };
  }
  if (typeof value !== "object" || value === null) return invalid();
  const record = value as Record<string, unknown>;
  if (record.app !== "duoasset") return invalid();
  if (record.formatVersion !== 1) {
    return { ok: false, message: "지원하지 않는 백업 형식입니다. 이 버전에서 내보낸 파일인지 확인해 주세요." };
  }
  const household = record.household as Record<string, unknown> | null | undefined;
  if (typeof household !== "object" || household === null || typeof household.name !== "string") return invalid();
  if (typeof record.exportedAt !== "string") return invalid();
  if (!ARRAY_KEYS.every((key) => Array.isArray(record[key]))) return invalid();
  return { ok: true, backup: value as BackupFile };
}

function invalid(): ParsedBackup {
  return { ok: false, message: "DuoAsset 백업 파일이 아니거나 내용이 손상되었습니다." };
}

export interface BackupSummary {
  householdName: string;
  /** 내보낸 시각 (서울 기준) "2026.11.25 14:03" */
  exportedAt: string;
  monthCount: number;
  firstMonth: Ym | null;
  lastMonth: Ym | null;
  assetCount: number;
  liabilityCount: number;
  memberCount: number;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const months = backup.months.map((row) => row.month).sort();
  return {
    householdName: backup.household.name,
    exportedAt: formatSeoulDateTime(backup.exportedAt),
    monthCount: months.length,
    firstMonth: months[0] ?? null,
    lastMonth: months.at(-1) ?? null,
    assetCount: backup.assets.length,
    liabilityCount: backup.liabilities.length,
    memberCount: backup.members.length,
  };
}

function formatSeoulDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

/** 파일 이름에 쓰는 서울 기준 날짜 "20261125" */
export function backupFileDate(now: Date = new Date()): string {
  return formatSeoulDateTime(now.toISOString()).slice(0, 10).replaceAll(".", "");
}

import { describe, expect, it } from "vitest";

import { backupFileDate, parseBackup, summarizeBackup } from "./backup-file";

// 가상의 값
function backupJson(overrides: Record<string, unknown> = {}) {
  return {
    app: "duoasset",
    formatVersion: 1,
    exportedAt: "2026-11-24T15:30:00.000Z",
    household: { id: "h", name: "테스트 가구", created_at: "2026-01-01T00:00:00Z" },
    members: [{ id: "a" }, { id: "b" }],
    assets: [{ id: "x" }, { id: "y" }, { id: "z" }],
    liabilities: [{ id: "l" }],
    planItems: [],
    months: [{ month: "2026-07" }, { month: "2026-05" }, { month: "2026-06" }],
    assetSnapshots: [],
    liabilitySnapshots: [],
    monthEntries: [],
    goals: [],
    goalAllocations: [],
    scenarios: [],
    events: [],
    ...overrides,
  };
}

describe("parseBackup", () => {
  it("올바른 백업을 읽는다", () => {
    const result = parseBackup(JSON.stringify(backupJson()));
    expect(result.ok).toBe(true);
  });

  it("JSON 이 아니면 거절한다", () => {
    expect(parseBackup("not json")).toMatchObject({ ok: false });
  });

  it("다른 앱의 파일이나 다른 형식 버전은 거절한다", () => {
    expect(parseBackup(JSON.stringify(backupJson({ app: "other" })))).toMatchObject({ ok: false });
    const v2 = parseBackup(JSON.stringify(backupJson({ formatVersion: 2 })));
    expect(v2).toMatchObject({ ok: false });
    if (!v2.ok) expect(v2.message).toContain("형식");
  });

  it("표 목록이 빠졌으면 거절한다", () => {
    expect(parseBackup(JSON.stringify(backupJson({ months: undefined })))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify(backupJson({ household: null })))).toMatchObject({ ok: false });
    expect(parseBackup("[]")).toMatchObject({ ok: false });
  });
});

describe("summarizeBackup", () => {
  it("내보낸 시각을 서울 기준으로, 달 범위와 개수를 센다", () => {
    const parsed = parseBackup(JSON.stringify(backupJson()));
    if (!parsed.ok) throw new Error("parse");
    expect(summarizeBackup(parsed.backup)).toEqual({
      householdName: "테스트 가구",
      exportedAt: "2026.11.25 00:30",
      monthCount: 3,
      firstMonth: "2026-05",
      lastMonth: "2026-07",
      assetCount: 3,
      liabilityCount: 1,
      memberCount: 2,
    });
  });

  it("달이 없으면 범위는 null", () => {
    const parsed = parseBackup(JSON.stringify(backupJson({ months: [] })));
    if (!parsed.ok) throw new Error("parse");
    expect(summarizeBackup(parsed.backup)).toMatchObject({ monthCount: 0, firstMonth: null, lastMonth: null });
  });
});

describe("backupFileDate", () => {
  it("서울 기준 날짜를 YYYYMMDD 로", () => {
    expect(backupFileDate(new Date("2026-11-24T15:30:00Z"))).toBe("20261125");
    expect(backupFileDate(new Date("2026-11-24T14:59:00Z"))).toBe("20261124");
  });
});

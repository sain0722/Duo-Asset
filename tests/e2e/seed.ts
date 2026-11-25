import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SeedResult } from "../../scripts/seed-demo";

/** global-setup 이 만든 가상 계정 정보 (gitignore 대상) */
export const SEED_FILE = join(process.cwd(), "test-results", ".e2e-seed.json");

export function seedFor(project: string): SeedResult {
  const seeds = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Record<string, SeedResult>;
  return seeds[project] ?? seeds.desktop;
}

import { existsSync, readFileSync, rmSync } from "node:fs";
import type { SeedResult } from "../../scripts/seed-demo";
import { removeHousehold } from "./helpers";
import { SEED_FILE } from "./seed";

/** global-setup 이 만든 가구와 계정을 지운다 (스펙별 가구는 각 스펙의 afterAll 이 지운다) */
export default async function globalTeardown() {
  if (!existsSync(SEED_FILE)) return;
  const seeds = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Record<string, SeedResult>;
  for (const seed of Object.values(seeds)) await removeHousehold(seed);
  rmSync(SEED_FILE, { force: true });
}

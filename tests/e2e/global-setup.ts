import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { seedDemo } from "../../scripts/seed-demo";
import { SEED_FILE } from "./seed";

/** 프로젝트(mobile / desktop)마다 가상의 가구를 하나씩 만든다. */
export default async function globalSetup() {
  const stamp = Date.now().toString(36);
  const seeds = {
    mobile: await seedDemo({ suffix: `e2e-m-${stamp}`, quiet: true }),
    desktop: await seedDemo({ suffix: `e2e-d-${stamp}`, quiet: true }),
  };
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(seeds, null, 2));
}

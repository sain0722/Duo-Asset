/**
 * 가상 데이터 시드 실행기: `npm run seed [suffix]`
 * 로컬 Supabase(`npx supabase start`)가 떠 있어야 한다.
 */
import { seedDemo } from "./seed-demo";

seedDemo({ suffix: process.argv[2] }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

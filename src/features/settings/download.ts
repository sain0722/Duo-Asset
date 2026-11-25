import { toast } from "sonner";

import { describeError } from "@/lib/data/errors";
import { exportBackup } from "@/lib/data/queries";

import { backupFileDate } from "./backup-file";

/** 메모리의 글자를 파일로 내려받게 한다. 서버나 저장소를 거치지 않는다. */
export function download(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // 클릭 직후 바로 해제하면 일부 브라우저(사파리)가 내려받기를 시작하지 못한다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 전체 백업을 파일로 내려받는다. 실패하면 토스트로 알린다. */
export async function downloadBackup(): Promise<boolean> {
  try {
    const backup = await exportBackup();
    download(JSON.stringify(backup, null, 2), `duoasset-backup-${backupFileDate()}.json`, "application/json");
    toast.success("백업 파일을 저장했습니다");
    return true;
  } catch (error) {
    toast.error(describeError(error));
    return false;
  }
}

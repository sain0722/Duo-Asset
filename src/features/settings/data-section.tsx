"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { history } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import type { BackupFile } from "@/lib/data/types";

import { backupFileDate, parseBackup } from "./backup-file";
import { download, downloadBackup } from "./download";
import { buildMonthlyCsv } from "./monthly-csv";
import { RestoreDialog } from "./restore-dialog";

export function DataSection() {
  const data = useHousehold();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState<BackupFile | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [session, setSession] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    await downloadBackup();
    setExporting(false);
  }

  function handleCsv() {
    download(buildMonthlyCsv(history(data)), `duoasset-monthly-${backupFileDate()}.csv`, "text/csv;charset=utf-8");
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    setRestoring(parsed.backup);
    setSession((n) => n + 1);
    setRestoreOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>데이터</CardTitle>
        <CardDescription>내려받은 파일에는 잔액·부채 같은 민감한 금융 정보가 그대로 담깁니다. 안전한 곳에 보관하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="-my-1 divide-y">
          <DataRow
            title="전체 백업"
            description="모든 기록을 JSON 파일로 저장합니다. 복원할 때 씁니다."
            action={
              <Button variant="outline" size="sm" loading={exporting} onClick={handleExport}>
                내보내기
              </Button>
            }
          />
          <DataRow
            title="월별 요약 CSV"
            description="달마다 수입·소비·저축과 자산·부채 합계. 엑셀에서 열 수 있습니다."
            action={
              <Button variant="outline" size="sm" disabled={data.months.length === 0} onClick={handleCsv}>
                내보내기
              </Button>
            }
          />
          <DataRow
            title="백업에서 복원"
            description="현재 가구의 재무 데이터를 백업 파일 내용으로 바꿉니다."
            action={
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                파일 선택
              </Button>
            }
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            // 같은 파일을 다시 골라도 change 가 일어나게 비운다
            event.target.value = "";
          }}
        />
      </CardContent>
      {restoring && <RestoreDialog key={session} backup={restoring} open={restoreOpen} onOpenChange={setRestoreOpen} />}
    </Card>
  );
}

function DataRow({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-body font-medium">{title}</p>
        <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

"use client";

import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { deleteRow, insertRow, updateRow } from "@/lib/data/mutations";
import type { Scenario } from "@/lib/finance/types";

type ScenarioControlsProps = {
  scenarios: Scenario[];
  selected: Scenario;
  base: Scenario;
  onSelect: (id: string) => void;
};

export function ScenarioControls({ scenarios, selected, base, onSelect }: ScenarioControlsProps) {
  const data = useHousehold();
  const mutate = useMutate();
  const [nameDialog, setNameDialog] = useState<{ open: boolean; key: number; mode: "create" | "rename" }>({ open: false, key: 0, mode: "create" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openName = (mode: "create" | "rename") => setNameDialog((d) => ({ open: true, key: d.key + 1, mode }));
  const ownEvents = data.events.filter((event) => event.scenario_id === selected.id).length;

  return (
    <div className="flex items-center gap-2">
      <NativeSelect aria-label="시나리오" value={selected.id} onChange={(e) => onSelect(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs">
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name}
            {scenario.is_base ? " (기본)" : ""}
          </option>
        ))}
      </NativeSelect>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-12" aria-label="시나리오 메뉴">
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => openName("create")}>
            <Plus aria-hidden />
            시나리오 추가
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openName("rename")}>
            <Pencil aria-hidden />
            이름 바꾸기
          </DropdownMenuItem>
          {!selected.is_base && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                삭제
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ScenarioNameDialog
        key={nameDialog.key}
        open={nameDialog.open}
        onOpenChange={(open) => setNameDialog((d) => ({ ...d, open }))}
        initial={nameDialog.mode === "rename" ? selected.name : ""}
        title={nameDialog.mode === "rename" ? "시나리오 이름 바꾸기" : "시나리오 추가"}
        description={
          nameDialog.mode === "create"
            ? `'${base.name}'의 가정을 복사해 시작합니다. 바꿔도 실제 기록과 다른 시나리오에는 영향이 없습니다.`
            : undefined
        }
        onSave={async (name) => {
          if (nameDialog.mode === "rename") {
            const result = await mutate(() => updateRow<Scenario>("scenarios", selected, { name }), { success: "이름을 바꿨습니다" });
            return result.ok;
          }
          const result = await mutate(
            () =>
              insertRow<Scenario>("scenarios", {
                name,
                is_base: false,
                assumptions: base.assumptions,
                excluded_event_ids: base.excluded_event_ids,
                sort_order: scenarios.reduce((max, s) => Math.max(max, s.sort_order + 1), 0),
              }),
            { success: "시나리오를 만들었습니다" },
          );
          if (result.ok) onSelect(result.value.id);
          return result.ok;
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`'${selected.name}' 시나리오를 삭제할까요?`}
        description={
          ownEvents > 0
            ? `이 시나리오에만 있는 이벤트 ${ownEvents}개도 함께 삭제됩니다. 실제 기록은 바뀌지 않습니다.`
            : "바꿔 둔 가정이 사라집니다. 실제 기록은 바뀌지 않습니다."
        }
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          const result = await mutate(() => deleteRow("scenarios", selected.id), { success: "시나리오를 삭제했습니다" });
          if (result.ok) onSelect(base.id);
        }}
      />
    </div>
  );
}

function ScenarioNameDialog({
  open,
  onOpenChange,
  initial,
  title,
  description,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  title: string;
  description?: string;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={async () => {
        if (!name.trim()) return setError("이름을 입력해 주세요.");
        setSaving(true);
        const ok = await onSave(name.trim());
        setSaving(false);
        if (ok) onOpenChange(false);
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            저장
          </Button>
        </>
      }
    >
      <FormField label="이름" error={error}>
        {(control) => (
          <Input {...control} value={name} maxLength={40} placeholder="예: 이직하면, 집 먼저 사면" onChange={(e) => setName(e.target.value)} />
        )}
      </FormField>
    </ResponsiveDialog>
  );
}

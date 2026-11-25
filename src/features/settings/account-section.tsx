"use client";

import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useHousehold } from "@/lib/data/hooks";
import { getSupabase } from "@/lib/data/supabase";

import { SettingRow } from "./setting-row";

const MIN_PASSWORD_LENGTH = 8;

export function AccountSection() {
  const { me } = useHousehold();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>계정</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="-my-1 divide-y">
          <SettingRow label="로그인 이메일" detail={<span className="break-all">{me.email ?? "—"}</span>} />
          <SettingRow
            label="비밀번호 변경"
            onClick={() => {
              setSession((n) => n + 1);
              setOpen(true);
            }}
          />
        </div>
        <SignOutButton className="w-full sm:w-auto sm:self-start" />
      </CardContent>
      <PasswordDialog key={session} email={me.email} open={open} onOpenChange={setOpen} />
    </Card>
  );
}

export function ThemeSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>화면</CardTitle>
      </CardHeader>
      <CardContent>
        <ThemeSwitch fullWidth />
      </CardContent>
    </Card>
  );
}

function PasswordDialog({ email, open, onOpenChange }: { email: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const found: typeof errors = {};
    if (password.length < MIN_PASSWORD_LENGTH) found.password = `${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요.`;
    else if (confirm !== password) found.confirm = "새 비밀번호와 같게 입력해 주세요.";
    setErrors(found);
    if (found.password || found.confirm) return;

    setSaving(true);
    try {
      // 비밀번호는 가구 데이터가 아니라 로그인 계정에 속한다. lib/data 를 거치지 않는 유일한 직접 호출.
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) {
        setErrors({ password: passwordErrorMessage(error.code) });
        return;
      }
      toast.success("비밀번호를 바꿨습니다");
      onOpenChange(false);
    } catch {
      toast.error("네트워크에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="비밀번호 변경"
      description="이 기기의 로그인은 유지됩니다."
      onSubmit={handleSubmit}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            변경
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 한다 */}
        <input type="email" name="username" autoComplete="username" value={email ?? ""} readOnly hidden />
        <FormField label="새 비밀번호" description={`${MIN_PASSWORD_LENGTH}자 이상`} error={errors.password}>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrors({});
              }}
            />
          )}
        </FormField>
        <FormField label="새 비밀번호 확인" error={errors.confirm}>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setErrors((prev) => ({ ...prev, confirm: undefined }));
              }}
            />
          )}
        </FormField>
      </div>
    </ResponsiveDialog>
  );
}

function passwordErrorMessage(code: string | undefined): string {
  switch (code) {
    case "same_password":
      return "지금 쓰는 비밀번호와 다르게 입력해 주세요.";
    case "weak_password":
      return "너무 쉬운 비밀번호입니다. 더 길거나 복잡하게 입력해 주세요.";
    case "reauthentication_needed":
    case "session_not_found":
      return "보안을 위해 다시 로그인한 뒤 바꿔 주세요.";
    default:
      return "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

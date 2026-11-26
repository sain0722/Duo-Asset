"use client";

import { useState } from "react";

import { FormField } from "@/components/form-field";
import { PocketBadge } from "@/components/pocket-badge";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pocketTone } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import type { Member } from "@/lib/finance/types";

import { renameHousehold, updateMember } from "@/lib/data/mutations";
import { SettingRow } from "./setting-row";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Editing = { kind: "household" } | { kind: "member"; memberId: string };

export function HouseholdSection() {
  const data = useHousehold();
  const { household, members, me } = data;
  const [editing, setEditing] = useState<Editing | null>(null);
  // 닫히는 동안에도 내용이 남아 있도록 대상은 유지하고, 열 때마다 폼을 새로 만든다.
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  function edit(next: Editing) {
    setEditing(next);
    setSession((n) => n + 1);
    setOpen(true);
  }

  const pendingPartner = members.find((member) => member.user_id === null);
  const editingMember = editing?.kind === "member" ? members.find((member) => member.id === editing.memberId) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>가구</CardTitle>
        <CardDescription>두 사람이 같은 데이터를 함께 봅니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="-my-1 divide-y">
          <SettingRow label="가구 이름" aside={<span className="max-w-40 truncate">{household.name}</span>} onClick={() => edit({ kind: "household" })} />
          {members.map((member) => (
            <SettingRow
              key={member.id}
              label={
                <span className="flex items-center gap-2">
                  <PocketBadge tone={pocketTone(data, member.id)} className="text-body">
                    {member.name}
                  </PocketBadge>
                  {member.id === me.id && <span className="text-caption font-normal text-muted-foreground">나</span>}
                </span>
              }
              detail={memberDetail(member)}
              aside={member.id === me.id ? undefined : <LinkBadge member={member} />}
              onClick={() => edit({ kind: "member", memberId: member.id })}
            />
          ))}
        </div>

        {pendingPartner && (
          <div className="flex flex-col gap-3 rounded-xl bg-secondary px-4 py-3.5 text-sm">
            <p className="leading-relaxed text-muted-foreground">
              {pendingPartner.email ? (
                <>
                  {pendingPartner.name}님이 <span className="font-medium break-all text-foreground">{pendingPartner.email}</span> 계정으로 로그인하면
                  자동으로 연결됩니다.
                </>
              ) : (
                <>{pendingPartner.name}님의 로그인 이메일을 등록하면, 그 계정으로 로그인할 때 자동으로 연결됩니다.</>
              )}{" "}
              배우자 계정은 관리자가 따로 발급해야 합니다.
            </p>
            {!pendingPartner.email && (
              <Button variant="outline" size="sm" className="self-start" onClick={() => edit({ kind: "member", memberId: pendingPartner.id })}>
                이메일 등록
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {editing?.kind === "household" && <HouseholdNameDialog key={session} open={open} onOpenChange={setOpen} />}
      {editingMember && <MemberDialog key={session} member={editingMember} open={open} onOpenChange={setOpen} />}
    </Card>
  );
}

function memberDetail(member: Member): string {
  if (member.user_id) return member.email ?? "연결됨";
  return member.email ?? "아직 초대하지 않았어요";
}

function LinkBadge({ member }: { member: Member }) {
  if (member.user_id) return <Badge variant="neutral">연결됨</Badge>;
  if (member.email) return <Badge variant="warning">초대 중</Badge>;
  return <Badge variant="outline">초대 전</Badge>;
}

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

function HouseholdNameDialog({ open, onOpenChange }: DialogProps) {
  const { household } = useHousehold();
  const mutate = useMutate();
  const [name, setName] = useState(household.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return setError("가구 이름을 입력해 주세요.");
    if (trimmed.length > 50) return setError("50자 이내로 입력해 주세요.");
    if (trimmed === household.name) return onOpenChange(false);
    setSaving(true);
    const result = await mutate(() => renameHousehold(household, trimmed), { success: "가구 이름을 바꿨습니다" });
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="가구 이름"
      description="두 사람 모두에게 보이는 이름입니다."
      onSubmit={handleSubmit}
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
      <FormField label="가구 이름" error={error}>
        {(control) => (
          <Input
            {...control}
            value={name}
            maxLength={50}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        )}
      </FormField>
    </ResponsiveDialog>
  );
}

function MemberDialog({ member, open, onOpenChange }: DialogProps & { member: Member }) {
  const { me, members } = useHousehold();
  const mutate = useMutate();
  // 연결된 계정의 이메일은 로그인 계정 그 자체라 여기서 바꾸지 않는다.
  const canEditEmail = member.user_id === null;
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase() || null;
    const found: typeof errors = {};
    if (!nextName) found.name = "이름을 입력해 주세요.";
    else if (nextName.length > 30) found.name = "30자 이내로 입력해 주세요.";
    if (canEditEmail && nextEmail) {
      if (!EMAIL_PATTERN.test(nextEmail)) found.email = "이메일 형식을 확인해 주세요.";
      else if (members.some((other) => other.id !== member.id && other.email === nextEmail)) {
        found.email = duplicateEmailMessage(me, nextEmail);
      }
    }
    setErrors(found);
    if (found.name || found.email) return;

    const emailChanged = canEditEmail && nextEmail !== member.email;
    if (nextName === member.name && !emailChanged) return onOpenChange(false);

    setSaving(true);
    const result = await mutate(() => updateMember(member, canEditEmail ? { name: nextName, email: nextEmail } : { name: nextName }), {
      success: "저장했습니다",
    });
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={member.id === me.id ? "내 정보" : `${member.name}님 정보`}
      onSubmit={handleSubmit}
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
      <div className="flex flex-col gap-5">
        <FormField label="이름" description="화면 곳곳에서 주머니 이름으로 쓰입니다." error={errors.name}>
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={30}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
          )}
        </FormField>

        {canEditEmail ? (
          <FormField
            label="로그인 이메일"
            optional
            description="이 이메일 계정으로 로그인하면 가구에 자동으로 연결됩니다. 비우면 초대가 취소됩니다."
            error={errors.email}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }}
              />
            )}
          </FormField>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">로그인 이메일</p>
            <p className="text-body break-all text-muted-foreground">{member.email ?? "—"}</p>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function duplicateEmailMessage(me: Member, email: string): string {
  return me.email === email ? "내 로그인 이메일과 달라야 합니다." : "이미 등록된 이메일입니다.";
}

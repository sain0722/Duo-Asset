"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/data/errors";
import { HOUSEHOLD_KEY, useHouseholdQuery } from "@/lib/data/hooks";
import { claimMembership, createHousehold } from "@/lib/data/mutations";
import type { HouseholdData } from "@/lib/data/types";
import type { Ym } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";

import { startMonthChoice } from "./start-month";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Claim = "checking" | "none" | "failed";

/**
 * 로그인했지만 가구가 없는 사용자. 먼저 초대(배우자 이메일 등록)가 있는지 확인해 연결하고,
 * 없으면 가구 만들기 폼을 보여 준다. 가구가 생기면 / 로 간다.
 */
export function OnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, isFetching, refetch } = useHouseholdQuery();
  const [claim, setClaim] = useState<Claim>("checking");
  const claimStarted = useRef(false);

  const hasHousehold = Boolean(data);
  useEffect(() => {
    if (hasHousehold) router.replace("/");
  }, [hasHousehold, router]);

  const noHousehold = data === null;
  useEffect(() => {
    if (!noHousehold || claimStarted.current) return;
    claimStarted.current = true;
    claimMembership()
      .then(async (householdId) => {
        if (!householdId) return setClaim("none");
        await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
        const joined = queryClient.getQueryData<HouseholdData | null>(HOUSEHOLD_KEY);
        const inviter = joined?.members.find((member) => member.id !== joined.me.id);
        toast.success(inviter ? `${inviter.name}님 가구에 연결되었습니다` : "가구에 연결되었습니다");
      })
      .catch((reason: unknown) => {
        toast.error(describeError(reason));
        setClaim("failed");
      });
  }, [noHousehold, queryClient]);

  if (isError && data === undefined) {
    return (
      <Frame>
        <EmptyState
          role="alert"
          className="px-0"
          title="정보를 불러오지 못했습니다"
          description={describeError(error)}
          action={
            <Button variant="outline" loading={isFetching} onClick={() => void refetch()}>
              다시 시도
            </Button>
          }
        />
      </Frame>
    );
  }

  if (isPending || data || claim === "checking") {
    return (
      <Frame>
        <div role="status" aria-label="확인하는 중" className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="mt-6 h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 className="text-[1.625rem] leading-snug font-bold tracking-tight">
        우리 집 가구를
        <br />
        만들어 볼까요
      </h1>
      <p className="mt-2 text-body text-muted-foreground">두 사람이 같은 자산·계획을 함께 봅니다. 한 사람이 만들고 배우자를 연결하세요.</p>
      <CreateHouseholdForm className="mt-8" />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-safe-10 pb-safe-10">
      <div className="flex w-full max-w-sm flex-col">
        <Logo size="lg" className="mb-8" />
        {children}
        <div className="mt-8 flex flex-col items-center gap-1 border-t pt-6">
          <p className="text-caption text-muted-foreground">배우자가 먼저 가구를 만들었나요? 초대받은 이메일로 로그인하세요.</p>
          <SignOutButton variant="ghost">다른 계정으로 로그인</SignOutButton>
        </div>
      </div>
    </main>
  );
}

function CreateHouseholdForm({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const [choice] = useState(() => startMonthChoice());
  const [householdName, setHouseholdName] = useState("");
  const [myName, setMyName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [startMonth, setStartMonth] = useState<Ym>(choice.suggested);
  const [errors, setErrors] = useState<Partial<Record<"householdName" | "myName" | "partnerName" | "partnerEmail", string>>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = {
      householdName: householdName.trim(),
      myName: myName.trim(),
      partnerName: partnerName.trim(),
      partnerEmail: partnerEmail.trim().toLowerCase() || null,
    };
    const found: typeof errors = {};
    if (!values.householdName) found.householdName = "가구 이름을 입력해 주세요.";
    if (!values.myName) found.myName = "내 이름을 입력해 주세요.";
    if (!values.partnerName) found.partnerName = "배우자 이름을 입력해 주세요.";
    if (values.partnerEmail && !EMAIL_PATTERN.test(values.partnerEmail)) found.partnerEmail = "이메일 형식을 확인해 주세요.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await createHousehold({ ...values, startMonth });
      // 가구가 생기면 화면 위쪽의 쿼리가 다시 읽혀 / 로 이동한다
      await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
    } catch (reason) {
      setFormError(describeError(reason));
      setPending(false);
    }
  }

  function field<K extends keyof typeof errors>(key: K, set: (value: string) => void) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      set(event.target.value);
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    };
  }

  const monthOptions = [
    { value: choice.lastMonth, label: `${formatMonthOnly(choice.lastMonth)} · 지난달` },
    { value: choice.thisMonth, label: `${formatMonthOnly(choice.thisMonth)} · 이번 달` },
  ];

  return (
    <form noValidate onSubmit={handleSubmit} className={className}>
      <div className="flex flex-col gap-5">
        <FormField label="가구 이름" error={errors.householdName}>
          {(control) => (
            <Input {...control} value={householdName} maxLength={50} placeholder="예: 우리 집" autoComplete="off" onChange={field("householdName", setHouseholdName)} />
          )}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="내 이름" error={errors.myName}>
            {(control) => <Input {...control} value={myName} maxLength={30} autoComplete="given-name" onChange={field("myName", setMyName)} />}
          </FormField>
          <FormField label="배우자 이름" error={errors.partnerName}>
            {(control) => <Input {...control} value={partnerName} maxLength={30} autoComplete="off" onChange={field("partnerName", setPartnerName)} />}
          </FormField>
        </div>
        <FormField
          label="배우자 로그인 이메일"
          optional
          description="배우자가 이 이메일 계정으로 로그인하면 자동으로 연결됩니다. 배우자 계정은 관리자가 따로 발급해야 합니다. 나중에 설정에서 등록해도 됩니다."
          error={errors.partnerEmail}
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
              value={partnerEmail}
              onChange={field("partnerEmail", setPartnerEmail)}
            />
          )}
        </FormField>
        <FormField
          label="기준 월"
          description="기준 월 말일의 잔액이 출발점입니다. 지난달을 고르면 지난달 말 잔액을 입력해 바로 시작할 수 있고, 이번 달 정산부터 수입·소비 분석이 나옵니다. 이번 달을 고르면 이번 달이 끝난 뒤에 시작됩니다."
        >
          {(_, { labelId }) => (
            <SegmentedControl aria-labelledby={labelId} fullWidth options={monthOptions} value={startMonth} onValueChange={setStartMonth} />
          )}
        </FormField>
      </div>

      {formError && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-7 w-full" loading={pending}>
        가구 만들기
      </Button>
    </form>
  );
}

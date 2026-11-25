"use client";

import { useState, useSyncExternalStore } from "react";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reloadTo, signIn } from "@/lib/data/auth";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

export function LoginForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 하이드레이션 전에는 제출을 막는다(스크립트가 준비되기 전에 누르면 브라우저가 폼을 직접 보내 버린다).
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setPending(true);
    setError(null);
    const result = await signIn(email, password);
    if (result.ok) {
      reloadTo("/");
      return;
    }
    setError(result.message);
    setPending(false);
  }

  return (
    // method="post": 스크립트 없이 제출되더라도 비밀번호가 주소(쿼리 문자열)에 실리지 않게 한다.
    <form method="post" noValidate onSubmit={handleSubmit} className={cn("flex flex-col gap-5", className)}>
      <FormField label="이메일">
        {(control) => (
          <Input
            {...control}
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="비밀번호">
        {(control) => (
          <Input
            {...control}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>

      {error && (
        <p role="alert" className="-my-1 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-1 w-full" loading={pending} disabled={!ready}>
        로그인
      </Button>
    </form>
  );
}

"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { signOut } from "@/lib/data/auth";

/** 로그아웃 버튼. 누르면 캐시와 세션을 지우고 로그인 화면으로 나간다(lib/data/auth 의 signOut). */
export function SignOutButton({ variant = "outline", children = "로그아웃", ...props }: Omit<ButtonProps, "onClick" | "loading">) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={() => {
        setPending(true);
        void signOut();
      }}
      {...props}
    >
      {!pending && <LogOut aria-hidden />}
      {children}
    </Button>
  );
}

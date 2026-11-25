"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";

const options = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
  { value: "system", label: "시스템" },
] as const;

type ThemeChoice = (typeof options)[number]["value"];

const subscribe = () => () => {};

type ThemeSwitchProps = {
  size?: "sm" | "default";
  fullWidth?: boolean;
  className?: string;
};

/** 라이트 · 다크 · 시스템 테마 선택. 설정 화면에서 쓴다. */
function ThemeSwitch({ size = "default", fullWidth = false, className }: ThemeSwitchProps) {
  const { theme, setTheme } = useTheme();
  // 저장된 테마는 브라우저에서만 알 수 있다. 하이드레이션이 끝난 뒤에 선택 상태를 표시한다.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <SegmentedControl
      size={size}
      fullWidth={fullWidth}
      className={className}
      aria-label="화면 테마"
      options={options}
      value={(mounted ? theme : "") as ThemeChoice}
      onValueChange={setTheme}
    />
  );
}

export { ThemeSwitch };
export type { ThemeSwitchProps };

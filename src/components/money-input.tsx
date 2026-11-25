"use client";

import * as React from "react";

import { fieldClassName } from "@/components/ui/input";
import type { Won } from "@/lib/finance/types";
import { formatKoreanWon, formatNumber, parseWonInput } from "@/lib/format";
import { cn } from "@/lib/utils";

const MINUS = "−"; // format.ts 와 같은 U+2212
const MAX_DIGITS = 13; // 조 단위까지
const DEFAULT_QUICK_AMOUNTS = [10_000, 100_000, 1_000_000] as const;

type MoneyInputProps = {
  /** 원 단위 정수. null 은 "미입력"이며 0 과 다르다. */
  value: Won | null;
  onChange: (value: Won | null) => void;
  /** 음수 허용(잔액 조정 등). 숫자 키패드에 − 키가 없는 기기를 위해 부호 버튼이 함께 나온다. */
  allowNegative?: boolean;
  placeholder?: string;
  /** 빠른 추가 칩. true 면 +1만 · +10만 · +100만, 배열이면 그 금액들. */
  quickAmounts?: boolean | readonly Won[];
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
};

function toText(value: Won | null): string {
  if (value == null) return "";
  return `${value < 0 ? MINUS : ""}${formatNumber(Math.abs(value))}`;
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

function isNegativeText(text: string): boolean {
  return /^\s*[-−]/.test(text);
}

/** digitCount 번째 숫자 바로 뒤의 문자 위치. 쉼표가 끼어도 커서가 같은 숫자 옆에 머문다. */
function caretAfterDigits(text: string, digitCount: number): number {
  if (digitCount <= 0) return isNegativeText(text) ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i]) && ++seen === digitCount) return i + 1;
  }
  return text.length;
}

/** 금액 입력. 입력하는 동안 천 단위 쉼표를 넣고, 아래에 한국어 읽기("480만 원")를 보여 준다. */
function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  placeholder = "금액 입력",
  quickAmounts = false,
  disabled = false,
  className,
  "aria-describedby": describedBy,
  ...inputProps
}: MoneyInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const readingId = React.useId();

  // 입력 중인 글자. "−" 만 친 상태처럼 값으로 표현되지 않는 중간 단계를 담는다.
  const [draft, setDraft] = React.useState(() => toText(value));
  // 밖에서 value 가 바뀌면(초기화, 빠른 추가 등) draft 대신 value 를 따른다.
  const text = parseWonInput(draft) === value ? draft : toText(value);

  // 쉼표가 다시 들어가면 브라우저가 커서를 맨 뒤로 보낸다. 다음 렌더 직후 제자리로 돌려놓는다.
  const pendingCaret = React.useRef<number | null>(null);
  const [, forceRender] = React.useReducer((count: number) => count + 1, 0);
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    if (input && caret != null && document.activeElement === input) input.setSelectionRange(caret, caret);
  });

  function commit(nextText: string, caret: number | null) {
    pendingCaret.current = caret;
    setDraft(nextText);
    forceRender();

    const parsed = parseWonInput(nextText);
    const nextValue = parsed == null ? null : parsed + 0; // "−0" 의 -0 을 0 으로
    if (nextValue !== value) onChange(nextValue);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { inputType, data } = event.nativeEvent as InputEvent;
    let raw = event.target.value;
    let caret = event.target.selectionStart ?? raw.length;

    // 쉼표만 지워진 경우: 사용자는 숫자를 지우려던 것이므로 옆 숫자를 대신 지운다.
    const onlySeparatorRemoved =
      raw.length === text.length - 1 && digitsOf(raw) === digitsOf(text) && isNegativeText(raw) === isNegativeText(text);
    if (onlySeparatorRemoved && inputType === "deleteContentBackward" && caret > 0) {
      raw = raw.slice(0, caret - 1) + raw.slice(caret);
      caret -= 1;
    } else if (onlySeparatorRemoved && inputType === "deleteContentForward") {
      raw = raw.slice(0, caret) + raw.slice(caret + 1);
    }

    // 붙여넣기 등으로 소수점·한국어 단위가 들어온 경우("1,234,567.00", "480만"):
    // 숫자만 뽑으면 100배·1만 배 틀린 값이 되므로 통째로 해석하고, 해석할 수 없으면 받지 않는다.
    if (/[.억만]/.test(raw)) {
      const parsed = parseWonInput(raw);
      const accepted =
        parsed != null && String(Math.abs(parsed)).length <= MAX_DIGITS && (parsed >= 0 || allowNegative);
      const nextText = accepted ? toText(parsed) : text;
      commit(nextText, nextText.length);
      return;
    }

    const rawDigits = digitsOf(raw);
    if (rawDigits.length > MAX_DIGITS) {
      // 자릿수 초과 입력은 받지 않고 커서만 원래 자리로 돌린다.
      commit(text, Math.max(0, caret - (raw.length - text.length)));
      return;
    }

    // "-" 는 어디서 치든 부호를 뒤집는다.
    const typedMinus = inputType === "insertText" && (data === "-" || data === MINUS);
    const negative = allowNegative && (typedMinus ? !isNegativeText(text) : isNegativeText(raw));

    const digits = rawDigits.replace(/^0+(?=\d)/, "");
    const removedLeadingZeros = rawDigits.length - digits.length;
    const digitsBeforeCaret = Math.max(0, digitsOf(raw.slice(0, caret)).length - removedLeadingZeros);

    const nextText = `${negative ? MINUS : ""}${digits === "" ? "" : formatNumber(Number(digits))}`;
    commit(nextText, caretAfterDigits(nextText, digitsBeforeCaret));
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    setDraft(toText(value)); // "−" 만 남은 입력 등을 정리한다
    inputProps.onBlur?.(event);
  }

  function toggleSign() {
    const nextText = isNegativeText(text) ? text.slice(1) : `${MINUS}${text}`;
    commit(nextText, nextText.length);
    inputRef.current?.focus();
  }

  const amounts = quickAmounts === true ? DEFAULT_QUICK_AMOUNTS : quickAmounts || [];
  const invalid = inputProps["aria-invalid"] === true || inputProps["aria-invalid"] === "true";

  return (
    <div data-slot="money-input" className={cn("w-full", className)}>
      <div className="relative">
        {allowNegative && (
          <button
            type="button"
            onClick={toggleSign}
            disabled={disabled}
            aria-label="부호 바꾸기"
            aria-pressed={isNegativeText(text)}
            className={cn(
              "absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-content-center rounded-lg bg-secondary text-lg leading-none font-medium text-muted-foreground",
              "transition-colors outline-none after:absolute after:-inset-1.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
              "disabled:pointer-events-none aria-pressed:bg-primary aria-pressed:text-primary-foreground",
            )}
          >
            ±
          </button>
        )}
        <input
          {...inputProps}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={describedBy ? `${describedBy} ${readingId}` : readingId}
          className={cn(
            fieldClassName,
            "h-12 pr-10 text-right text-[1.0625rem] font-semibold tabular-nums placeholder:font-normal",
            allowNegative ? "pl-12" : "pl-3.5",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-body font-medium",
            value == null || disabled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          원
        </span>
      </div>

      {/*
        값이 없어도 한 줄 높이를 유지해 입력 중 레이아웃이 흔들리지 않게 한다.
        단, 비어 있고 오류가 난 칸은 자리를 비우지 않는다 — 바로 아래에 붙는 오류 문구가 이 칸의 것임이 분명해야 한다.
      */}
      <p
        id={readingId}
        className={cn(
          "pr-0.5 text-right text-caption leading-5 text-muted-foreground tabular-nums",
          value == null && invalid ? "sr-only" : "mt-1.5 min-h-5",
        )}
      >
        {value == null ? "" : formatKoreanWon(value)}
      </p>

      {amounts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
          {amounts.map((amount) => (
            <button
              key={amount}
              type="button"
              disabled={disabled}
              onClick={() => onChange((value ?? 0) + amount)}
              className={cn(
                "relative h-8 rounded-lg border border-input bg-card px-2.5 text-caption font-medium text-foreground tabular-nums",
                "transition-colors outline-none after:absolute after:-inset-y-1.5 after:inset-x-0 hover:bg-accent",
                "focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45",
                "dark:bg-foreground/[0.04]",
              )}
            >
              +{formatKoreanWon(amount).replace(/\s?원$/, "")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { MoneyInput };
export type { MoneyInputProps };

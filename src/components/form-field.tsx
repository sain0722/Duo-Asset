import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** 컨트롤에 그대로 펼쳐 넣는 속성. 라벨·도움말·오류와 컨트롤을 연결한다. */
type FormFieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FormFieldProps = {
  label: React.ReactNode;
  /** 컨트롤 아래 도움말. 오류가 있으면 오류가 대신 보인다. */
  description?: React.ReactNode;
  /** 오류 문구. 있으면 컨트롤이 오류 상태가 된다. */
  error?: React.ReactNode;
  /** 라벨 옆에 "선택" 표시를 붙인다. 필수 항목은 표시하지 않는다(대부분이 필수이므로). */
  optional?: boolean;
  /** 라벨 오른쪽 끝(InfoTip 등) */
  labelAside?: React.ReactNode;
  className?: string;
  /**
   * 컨트롤. 함수로 넘기면 id · aria 속성을 받아 컨트롤에 펼쳐 넣을 수 있다.
   * 여러 요소로 된 컨트롤(SegmentedControl, Slider)은 두 번째 인자의 labelId 를 aria-labelledby 로 넘긴다.
   */
  children: React.ReactNode | ((control: FormFieldControlProps, extra: { labelId: string }) => React.ReactNode);
};

/** 라벨 + 컨트롤 + 도움말/오류 한 묶음. */
function FormField({ label, description, error, optional = false, labelAside, className, children }: FormFieldProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const messageId = `${id}-message`;
  const hasError = error != null && error !== false && error !== "";
  const message = hasError ? error : description;

  const control: FormFieldControlProps = {
    id,
    "aria-describedby": message ? messageId : undefined,
    "aria-invalid": hasError ? true : undefined,
  };

  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label id={labelId} htmlFor={id}>
          {label}
          {optional && <span className="font-normal text-muted-foreground">선택</span>}
        </Label>
        {labelAside}
      </div>
      {typeof children === "function" ? children(control, { labelId }) : children}
      {message && (
        <p id={messageId} role={hasError ? "alert" : undefined} className={cn("text-caption leading-5", hasError ? "text-destructive" : "text-muted-foreground")}>
          {message}
        </p>
      )}
    </div>
  );
}

export { FormField };
export type { FormFieldControlProps, FormFieldProps };

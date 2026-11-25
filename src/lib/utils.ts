import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// globals.css 에 추가한 글자 크기(text-body, text-caption)를 색이 아니라 크기로 인식시킨다.
// 그러지 않으면 cn("text-body", "text-muted-foreground") 에서 앞의 것이 지워진다.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["body", "caption"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

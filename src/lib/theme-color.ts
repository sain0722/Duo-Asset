/**
 * 브라우저 UI(주소창·상태바)에 쓰는 배경색. globals.css 의 --background 와 같은 색을 hex 로 적는다.
 * <meta name="theme-color"> 는 CSS 변수를 읽지 못하므로 값을 따로 둔다.
 */
export const THEME_COLOR = {
  light: "#f5f7f9",
  dark: "#0b0e14",
} as const;

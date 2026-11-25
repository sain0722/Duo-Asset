/** 다른 기기에서 먼저 수정해 version 이 맞지 않는다 */
export class ConflictError extends Error {
  constructor() {
    super("다른 기기에서 먼저 수정했습니다. 최신 내용을 다시 불러왔으니 확인 후 다시 시도해 주세요.");
    this.name = "ConflictError";
  }
}

/** RLS·권한에 막혔다 (마감된 달을 고치려 했거나 가구 구성원이 아님) */
export class PermissionError extends Error {
  constructor() {
    super("수정할 수 없습니다. 마감된 달이거나 권한이 없습니다.");
    this.name = "PermissionError";
  }
}

/** 서버에 닿지 못했다 (오프라인, 일시 장애) */
export class NetworkError extends Error {
  constructor() {
    super("네트워크에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "NetworkError";
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

const RPC_MESSAGES: Record<string, string> = {
  version_conflict: "다른 기기에서 먼저 수정했습니다. 다시 확인해 주세요.",
  month_not_open: "이미 마감된 달입니다.",
  month_incomplete: "미확인 항목이 남아 있어 마감할 수 없습니다.",
  month_not_ended: "아직 끝나지 않은 달은 마감할 수 없습니다. 다음 달 1일부터 마감할 수 있습니다.",
  month_not_closed: "마감되지 않은 달입니다.",
  earlier_month_open: "이전 달을 먼저 마감해 주세요.",
  later_month_closed: "가장 최근에 마감한 달만 다시 열 수 있습니다.",
  already_member: "이미 가구에 속해 있습니다.",
  already_invited: "이 계정은 이미 다른 가구에 초대되어 있습니다.",
  partner_email_same_as_mine: "배우자 이메일은 내 이메일과 달라야 합니다.",
  not_a_member: "가구 구성원이 아닙니다.",
  not_authenticated: "로그인이 필요합니다.",
  invalid_backup: "DuoAsset 백업 파일이 아니거나 내용이 올바르지 않습니다.",
  member_mismatch: "백업의 구성원 수가 현재 가구와 다릅니다.",
};

/** Supabase(PostgREST) 오류를 앱 오류로 바꾼다 */
export function toAppError(error: PostgrestLikeError): Error {
  const message = error.message ?? "";
  // supabase-js 는 fetch 실패를 던지지 않고 code 없는 오류 객체로 돌려준다
  if (!error.code && /fetch|network|load failed/i.test(message)) return new NetworkError();
  if (error.code === "40001" || message.includes("version_conflict")) return new ConflictError();
  if (error.code === "42501") return new PermissionError();
  for (const [key, text] of Object.entries(RPC_MESSAGES)) {
    if (message.includes(key)) return new Error(text);
  }
  if (error.code === "23505") return new Error("이미 같은 항목이 있습니다.");
  if (error.code === "23503") return new Error("다른 기록에서 사용 중이라 삭제할 수 없습니다. 보관 처리해 주세요.");
  if (error.code === "23514") return new Error("입력값이 올바르지 않습니다.");
  return new Error(message || "요청을 처리하지 못했습니다.");
}

/** 사용자에게 보여 줄 문구 */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "알 수 없는 오류가 발생했습니다.";
}

import { ConflictError, toAppError } from "@/lib/data/errors";
import { getSupabase } from "@/lib/data/supabase";
import type { Household, Member } from "@/lib/finance/types";

/*
 * households · members 는 version 컬럼이 없어 updateRow(낙관적 잠금)를 쓸 수 없다.
 * lib/data 에 해당 함수가 생기기 전까지 여기서 처리한다(보고서 "요청 사항" 참고).
 * 잠금 대신 "읽었던 값이 그대로일 때만" 고친다: 다른 기기에서 먼저 바꿨다면 고쳐진 행이 없어 ConflictError.
 */

export async function renameHousehold(household: Household, name: string): Promise<Household> {
  const { data, error } = await getSupabase()
    .from("households")
    .update({ name })
    .eq("id", household.id)
    .eq("name", household.name)
    .select()
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) throw new ConflictError();
  return data as Household;
}

/** 구성원 이름·초대 이메일. 이메일은 소문자로 저장한다(DB 제약). 연결된 구성원의 이메일은 바꾸지 않는다. */
export async function updateMember(member: Member, patch: { name: string; email?: string | null }): Promise<Member> {
  let query = getSupabase()
    .from("members")
    .update(patch.email === undefined ? { name: patch.name } : { name: patch.name, email: patch.email?.toLowerCase() ?? null })
    .eq("id", member.id)
    .eq("name", member.name);
  query = member.email === null ? query.is("email", null) : query.eq("email", member.email);
  const { data, error } = await query.select().maybeSingle();
  if (error) {
    if (error.code === "23505") throw new Error("이미 다른 구성원이 쓰고 있는 이메일입니다.");
    throw toAppError(error);
  }
  if (!data) throw new ConflictError();
  return data as Member;
}

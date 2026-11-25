import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-safe-10 pb-safe-10">
      <EmptyState
        title="화면을 찾을 수 없습니다"
        description="주소가 바뀌었거나 없는 화면입니다."
        action={
          <Button asChild variant="outline">
            <Link href="/">홈으로</Link>
          </Button>
        }
      />
    </main>
  );
}

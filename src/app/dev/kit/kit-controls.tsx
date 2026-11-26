"use client";

import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { PocketBadge } from "@/components/pocket-badge";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent } from "@/lib/format";

/* 아래 금액·이름은 모두 화면을 보여 주기 위한 가상의 값이다. */

const owners = [
  { value: "member-1", label: "지훈" },
  { value: "member-2", label: "서연" },
  { value: "joint", label: "공동" },
] as const;

const swatches = [
  { name: "background", className: "bg-background" },
  { name: "card", className: "bg-card" },
  { name: "muted", className: "bg-muted" },
  { name: "primary", className: "bg-primary" },
  { name: "brand", className: "bg-brand" },
  { name: "up", className: "bg-up" },
  { name: "down", className: "bg-down" },
  { name: "warning", className: "bg-warning" },
  { name: "destructive", className: "bg-destructive" },
  { name: "chart-1 · member-1", className: "bg-chart-1" },
  { name: "chart-2 · member-2", className: "bg-chart-2" },
  { name: "chart-3 · joint", className: "bg-chart-3" },
  { name: "chart-4", className: "bg-chart-4" },
  { name: "chart-5", className: "bg-chart-5" },
  { name: "chart-6", className: "bg-chart-6" },
];

export function KitControls() {
  const [name, setName] = useState("주거래 통장");
  const [balance, setBalance] = useState<number | null>(4_800_000);
  const [adjustment, setAdjustment] = useState<number | null>(null);
  const [kind, setKind] = useState("");
  const [owner, setOwner] = useState<(typeof owners)[number]["value"]>("member-1");
  const [liquid, setLiquid] = useState(true);
  const [carryOver, setCarryOver] = useState(false);
  const [rate, setRate] = useState([4]);

  const [formOpen, setFormOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dialogBalance, setDialogBalance] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-2">
      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle>입력</CardTitle>
          <CardDescription>FormField 로 라벨·도움말·오류를 묶는다</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FormField label="이름" error={name.trim() === "" ? "이름을 입력해 주세요." : undefined}>
            {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 주거래 통장" />}
          </FormField>

          <FormField
            label="현재 잔액"
            labelAside={<InfoTip title="현재 잔액">정산하는 날 기준으로 계좌에 찍힌 금액을 그대로 적습니다.</InfoTip>}
            description="비워 두면 미확인으로 남습니다. 0원과는 다릅니다."
          >
            {(control) => <MoneyInput {...control} value={balance} onChange={setBalance} quickAmounts />}
          </FormField>

          <FormField label="잔액 조정" optional description="음수를 넣을 수 있는 입력">
            {(control) => <MoneyInput {...control} value={adjustment} onChange={setAdjustment} allowNegative placeholder="0" />}
          </FormField>

          <FormField label="자산 유형">
            {(control) => (
              <NativeSelect {...control} value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="">선택해 주세요</option>
                <option value="cash">현금성 자산</option>
                <option value="deposit">예금·적금</option>
                <option value="stock">주식·투자</option>
                <option value="pension">퇴직연금</option>
              </NativeSelect>
            )}
          </FormField>

          <FormField label="소유자">
            {(_, { labelId }) => (
              <SegmentedControl fullWidth aria-labelledby={labelId} options={owners} value={owner} onValueChange={setOwner} />
            )}
          </FormField>

          <FormField label="예상 투자수익률" labelAside={<span className="text-sm font-semibold tabular-nums">연 {formatPercent(rate[0])}</span>}>
            {(_, { labelId }) => <Slider aria-labelledby={labelId} value={rate} onValueChange={setRate} min={0} max={12} step={0.5} />}
          </FormField>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="kit-liquid">바로 쓸 수 있는 돈</Label>
              <p className="mt-1.5 text-caption text-muted-foreground">가용자산에 포함합니다.</p>
            </div>
            <Switch id="kit-liquid" checked={liquid} onCheckedChange={setLiquid} />
          </div>

          <div className="flex items-center gap-3">
            <Checkbox id="kit-carry" checked={carryOver} onCheckedChange={(checked) => setCarryOver(checked === true)} />
            <Label htmlFor="kit-carry" className="font-normal">
              다음 달에도 같은 금액으로 채우기
            </Label>
          </div>

          <FormField label="메모" optional>
            {(control) => <Textarea {...control} placeholder="필요하면 적어 두세요" />}
          </FormField>

          <div className="flex gap-2 [&>*]:flex-1">
            <Button variant="secondary" size="lg">
              취소
            </Button>
            <Button size="lg" onClick={() => toast("저장했습니다")}>
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 sm:gap-5">
        {/* 버튼 · 배지 */}
        <Card>
          <CardHeader>
            <CardTitle>버튼 · 배지</CardTitle>
            <CardDescription>화면마다 주 버튼은 하나만</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button>정산 시작</Button>
              <Button variant="brand">목표 달성</Button>
              <Button variant="secondary">취소</Button>
              <Button variant="outline">내보내기</Button>
              <Button variant="ghost">건너뛰기</Button>
              <Button variant="destructive">삭제</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary">
                <Plus aria-hidden />
                자산 추가
              </Button>
              <Button size="sm" variant="outline">
                수정
              </Button>
              <Button loading>저장 중</Button>
              <Button disabled>비활성</Button>
              <Button variant="link">정산 이력 보기</Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="자산 추가">
                    <Plus aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>자산 추가</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>기준 월</Badge>
              <Badge variant="outline">예정</Badge>
              <Badge variant="solid">마감</Badge>
              <Badge variant="brand">목표 달성</Badge>
              <Badge variant="warning">미확인 3건</Badge>
              <Badge variant="up">증가</Badge>
              <Badge variant="down">감소</Badge>
              <Badge variant="destructive">오류</Badge>
            </div>
          </CardContent>
        </Card>

        {/* 겹쳐 뜨는 것들 */}
        <Card>
          <CardHeader>
            <CardTitle>대화상자 · 메뉴 · 알림</CardTitle>
            <CardDescription>입력 폼은 PC 에서 가운데, 모바일에서 아래에서 뜬다</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                잔액 입력
              </Button>
              <Button variant="outline" onClick={() => setCloseOpen(true)}>
                월 마감
              </Button>
              <Button variant="outline" onClick={() => toast("저장했습니다")}>
                알림
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast("다른 기기에서 먼저 수정했습니다", {
                    description: "최신 값을 다시 불러왔어요.",
                    action: { label: "확인", onClick: () => {} },
                  })
                }
              >
                충돌 알림
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body font-medium">청약 적금</p>
                <PocketBadge tone="member-2" className="text-caption font-normal text-muted-foreground">
                  서연
                </PocketBadge>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Money amount={12_400_000} className="text-body font-semibold" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="청약 적금 메뉴" className="-mr-2">
                      <Ellipsis aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <Pencil aria-hidden />
                      수정
                    </DropdownMenuItem>
                    <DropdownMenuItem>사용 안 함으로 바꾸기</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 aria-hidden />
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 탭 · 금액 표기 */}
        <Card>
          <CardHeader>
            <CardTitle>탭 · 금액 표기</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="plan">
              <TabsList>
                <TabsTrigger value="plan">계획</TabsTrigger>
                <TabsTrigger value="actual">실제</TabsTrigger>
              </TabsList>
              <TabsContent value="plan">
                <dl className="flex flex-col gap-3 text-body">
                  <Row label="정확한 값">
                    <Money amount={123_456_789} />
                  </Row>
                  <Row label="요약(compact)">
                    <Money amount={123_456_789} compact />
                  </Row>
                  <Row label="부호(sign)">
                    <Money amount={-692_000} sign />
                  </Row>
                  <Row label="미확인(null)">
                    <Money amount={null} />
                  </Row>
                </dl>
              </TabsContent>
              <TabsContent value="actual">
                <dl className="flex flex-col gap-3 text-body">
                  <Row label="증가">
                    <Delta amount={4_150_000} />
                  </Row>
                  <Row label="감소">
                    <Delta amount={-1_280_000} />
                  </Row>
                  <Row label="변동 없음">
                    <Delta amount={0} />
                  </Row>
                  <Row label="요약(compact)">
                    <Delta amount={123_456_789} compact />
                  </Row>
                </dl>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

      </div>

      {/* 색 토큰 */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>색 토큰</CardTitle>
          <CardDescription>색은 의미가 있을 때만 쓴다</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            {swatches.map((swatch) => (
              <li key={swatch.name} className="flex items-center gap-2.5 text-caption">
                <span aria-hidden className={`size-8 shrink-0 rounded-lg border ${swatch.className}`} />
                <span className="min-w-0 truncate text-muted-foreground">{swatch.name}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ResponsiveDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="11월 잔액 입력"
        description="그 달 말일 계좌 잔액을 적어 주세요."
        onSubmit={() => {
          setFormOpen(false);
          toast("잔액을 저장했습니다");
        }}
        footer={
          <>
            <Button type="button" variant="secondary" size="lg" onClick={() => setFormOpen(false)}>
              취소
            </Button>
            <Button type="submit" size="lg">
              저장
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormField label="주거래 통장" labelAside={<PocketBadge tone="member-1">지훈</PocketBadge>}>
            {(control) => <MoneyInput {...control} value={dialogBalance} onChange={setDialogBalance} quickAmounts autoFocus />}
          </FormField>
          <FormField label="메모" optional>
            {(control) => <Input {...control} placeholder="예: 보너스 포함" />}
          </FormField>
        </div>
      </ResponsiveDialog>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="11월을 마감할까요?"
        description="마감하면 이번 달 결과가 확정되고, 설정을 바꿔도 달라지지 않습니다. 필요하면 다시 열 수 있어요."
        confirmLabel="마감"
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          toast("11월을 마감했습니다");
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="청약 적금을 삭제할까요?"
        description="지금까지 기록한 월별 잔액도 함께 지워지며 되돌릴 수 없습니다."
        confirmLabel="삭제"
        destructive
        onConfirm={() => {
          toast("삭제했습니다");
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

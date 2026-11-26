# UI 가이드

화면을 만들 때 이 문서만 보면 되도록 정리했다. 실제 모습은 개발 서버의 `/dev/kit`(화면 예시)과 `/dev/kit/controls`(컨트롤)에서 확인한다.

방향: **타이포그래피 중심, 모노크롬.** 숫자가 주인공이고, 색은 뜻이 있을 때만 쓴다. 관리자 페이지처럼 보이면 실패다.

## 구조

| 위치 | 내용 |
|------|------|
| `src/app/globals.css` | 토큰(라이트/다크), 베이스 스타일, safe-area 유틸리티 |
| `src/components/ui/` | 기본 컴포넌트 (shadcn 방식, 소스 소유) |
| `src/components/` | 공용 조합 (금액, 지표, 폼, 차트 등) |
| `src/features/<기능>/` | 화면 전용 컴포넌트 |

- 클래스 합치기는 `cn()` (`@/lib/utils`). 아이콘은 `lucide-react`.
- `components.json`이 있어 레지스트리에 접근할 수 있는 환경에서는 `npx shadcn add <이름>`으로 추가할 수 있다. 추가한 뒤에는 이 문서의 토큰·크기 규칙에 맞게 다듬는다.

## 토큰

색·반경은 아래 유틸리티만 쓴다. hex, `text-zinc-500` 같은 Tailwind 기본 색은 쓰지 않는다. 투명도는 `bg-brand/12`처럼 붙인다.

### 표면과 잉크

| 토큰 | 용도 |
|------|------|
| `background` / `foreground` | 화면 바탕(옅은 쿨 그레이 · 다크: 깊은 네이비) / 본문 글자 |
| `card` | 카드 표면. 테두리 1px만 쓰고 그림자는 쓰지 않는다 |
| `popover` | 떠 있는 표면(팝오버·메뉴·다이얼로그·시트). `shadow-pop`과 함께 |
| `primary` / `primary-foreground` | 잉크. 주 버튼, 체크·스위치 켜짐 (라이트: 거의 검정, 다크: 거의 흰색) |
| `secondary` | 보조 버튼, 세그먼트 트랙, 중립 배지 |
| `muted` / `muted-foreground` | 스켈레톤·비활성 바탕 / 보조 글자(라벨·설명·축 눈금) |
| `accent` | hover 바탕 |
| `border` / `input` | 구분선·카드 테두리 / 입력 컨트롤 테두리 |
| `ring` | 포커스 링(= brand) |
| `overlay` | 모달 뒤 가림막 |

### 의미 색

| 토큰 | 뜻 | 쓰는 곳 |
|------|----|---------|
| `brand` (`brand-foreground`) | 진행·달성·링크·포커스 | Progress, 달성률, 링크 버튼 |
| `up` | 금액 **증가** (붉은 계열, 한국 관례) | `Delta` |
| `down` | 금액 **감소** (푸른 계열) | `Delta` |
| `warning` | 예산 초과·미확인 — **채움·점·아이콘용** | Progress `tone="warning"` |
| `warning-foreground` | 경고 **글자색** | `Badge variant="warning"`, 경고 문구 |
| `destructive` (`destructive-foreground`) | 삭제·오류 | 삭제 버튼, 폼 오류 |

- `up`/`down`은 방향만 뜻한다. 좋고 나쁨(부채가 늘었다 등)은 문구로 설명한다.
- `brand`·`up`·`down`·`destructive`는 카드 위 글자로 써도 대비 4.5:1 이상이다. `warning`은 글자로 쓰면 대비가 모자라므로 글자에는 `warning-foreground`를 쓴다.

### 주머니와 차트

| 토큰 | 뜻 |
|------|----|
| `member-1` | 구성원 1 (인디고 바이올렛) = `chart-1` |
| `member-2` | 구성원 2 (틸) = `chart-2` |
| `joint` | 공동 (골드) = `chart-3` |
| `chart-1` … `chart-6` | 차트 계열. **순서대로** 배정하고 건너뛰거나 순환하지 않는다 |

차트 계열은 색각 이상(적·녹) 시뮬레이션에서 이웃한 색이 구분되도록 검증한 값이다. 색을 바꾸면 라이트·다크 모두 다시 검증한다.

### 글자

글꼴은 Pretendard Variable(자체 호스팅). 본문 기본은 `text-body`.

| 클래스 | 크기 | 용도 |
|--------|------|------|
| `text-xs` | 12px | 배지, 차트 눈금 |
| `text-caption` | 13px | 도움말, 날짜, 부가 설명 |
| `text-sm` | 14px | 라벨, 보조 줄, 카드 설명 |
| `text-body` | 15px | 본문, 목록 항목, 버튼 |
| `text-base` | 16px | 입력 컨트롤(iOS 확대 방지를 위해 16px 미만 금지), 카드 제목 |
| `text-lg` | 18px | 다이얼로그 제목, 작은 지표 값 |
| `num-display` + `text-2xl` 이상 | 24px~ | 큰 금액. 고정폭 숫자 + 좁은 자간 |

- 금액에는 항상 `tabular-nums`(`Money`·`Delta`가 알아서 붙인다). 퍼센트·날짜도 열을 맞출 때는 `tabular-nums`.
- 굵기: 본문 400, 라벨 500, 값·제목 600, 큰 숫자·화면 제목 700.

### 반경 · 간격 · 크기

- 반경: 배지 `rounded-sm`(6) · 작은 컨트롤 `rounded-lg`(10) · 버튼·입력 `rounded-xl`(12) · 카드·다이얼로그 `rounded-2xl`(16) · 하단 시트 `rounded-t-3xl`(24)
- 카드 안쪽 여백은 `Card`가 정한다(모바일 20px, sm 이상 24px). 카드 사이 간격은 `gap-4 sm:gap-5`.
- 높이: 입력 컨트롤 48px(`h-12`), 버튼 44px(기본) · 36px(`sm`) · 48px(`lg`). 터치 대상은 44px 이상이어야 한다. 36px짜리 컴포넌트는 보이지 않는 터치 영역을 44px로 넓혀 두었다.
- 그라데이션, 장식용 아이콘, 눈에 띄는 애니메이션은 쓰지 않는다.

### safe-area

`pt-safe` `pb-safe` `pl-safe` `pr-safe` `px-safe` `mb-safe` `bottom-safe` `min-h-screen-safe`, 그리고 간격을 더하는 `pt-safe-4` · `pb-safe-3` 꼴(숫자는 Tailwind 간격 단위). 화면 아래에 붙는 요소(하단 탭, 고정 버튼)에는 반드시 `pb-safe`를 쓴다.

## 화면 틀

```tsx
<PageContainer>
  <PageHeader title="자산" description="…" actions={<Button>자산 추가</Button>} />
  <SectionTabs items={[{ href: "/assets", label: "자산" }, { href: "/liabilities", label: "부채·고정지출" }]} />
  <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">…카드들…</div>
</PageContainer>
```

| 컴포넌트 | props | 메모 |
|----------|-------|------|
| `PageContainer` (`@/components/page`) | `size?: "default" \| "narrow"` | 좌우 여백과 최대 폭. 대시보드·목록은 default(72rem), 설정·단일 폼은 narrow(40rem) |
| `PageHeader` | `title` `description?` `actions?` | `h1`은 여기 하나만 |
| `SectionTabs` | `items: {href, label}[]` `aria-label?` | **경로를 오가는** 탭. 현재 경로(하위 경로 포함)에 맞는 항목이 활성화된다 |
| `Card` `CardHeader` `CardTitle` `CardDescription` `CardAction` `CardContent` `CardFooter` | — | `CardAction`은 헤더 오른쪽 위. 카드를 카드 안에 넣지 않는다 |
| `MonthSwitcher` | `value: Ym` `onChange` `min?` `max?` | `‹ 2026년 11월 ›`. 현재 월은 `currentYm()`(Asia/Seoul)으로 구한다 |
| `ThemeSwitch` | `size?` `fullWidth?` | 라이트·다크·시스템. 설정 화면용 |

## 금액과 지표

| 컴포넌트 | props | 메모 |
|----------|-------|------|
| `Money` | `amount: Won \| null` `compact?` `sign?` `className?` | 기본 `123,456,789원`, `compact`는 `1억 2,346만 원`, `sign`은 양수에 `+`. **`null`은 "—"(미확인)** 으로 0원과 구분된다. 크기·굵기는 `className`이나 부모에서 |
| `Delta` | `amount: Won \| null` `compact?` `className?` | 증가 ▲ `up` · 감소 ▼ `down` · 0은 중립. 크기는 부호 없이 절댓값 |
| `Stat` | `label` `value` `sub?` `info?` `size?: "sm" \| "md" \| "lg"` | 라벨 + 큰 값 + 보조 줄. `lg`는 화면에 하나뿐인 대표 숫자 |
| `InfoTip` | `title?` `children` | 지표 정의를 보여 주는 (i) 버튼(탭으로 열림). 문구는 `finance-rules.md`와 맞춘다 |
| `PocketBadge` | `tone: "member-1" \| "member-2" \| "joint"` `children` | 색 점 + 이름. 같은 색을 차트에 쓸 때는 `pocketColor(tone)` |
| `Progress` (`ui/progress`) | `value: number \| null`(0~100) `tone?: "brand" \| "ink" \| "warning" \| "member-1" \| "member-2" \| "joint"` `aria-label` | 100을 넘으면 꽉 찬 막대. 초과는 `tone="warning"` + 배지로 알린다 |
| `Badge` (`ui/badge`) | `variant?: "neutral" \| "outline" \| "solid" \| "brand" \| "up" \| "down" \| "warning" \| "destructive"` | 상태 표시. 한 행에 하나 정도만 |

```tsx
<Stat
  size="lg"
  label="순자산"
  info={<InfoTip title="순자산">총자산에서 총부채를 뺀 금액입니다.</InfoTip>}
  value={<Money amount={report.netWorth} />}
  sub={<>지난달보다 <Delta amount={report.netWorthChange} /></>}
/>
```

규칙

- 합계·비율은 `lib/finance`가 계산한 값을 받아서 보여 주기만 한다.
- 지표에는 `InfoTip`을 붙인다. 계획값과 실제값, 미확인을 섞어 보여 주지 않는다.
- 좁은 칸(모바일 2열 등)에는 `compact`를 쓴다. 좁은 화면에서 라벨–값 쌍은 가로 한 줄(`flex justify-between`)로 쌓는 편이 읽기 쉽다.

## 입력

입력 폼은 **항상 `ResponsiveDialog` 안에** 둔다(PC: 가운데 다이얼로그, 모바일: 하단 시트).

```tsx
<ResponsiveDialog
  open={open}
  onOpenChange={setOpen}
  title="11월 잔액 입력"
  description="그 달 말일 잔액을 적어 주세요."
  onSubmit={handleSubmit}
  footer={
    <>
      <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>취소</Button>
      <Button type="submit" size="lg" loading={saving}>저장</Button>
    </>
  }
>
  <div className="flex flex-col gap-5">
    <FormField label="잔액" error={errors.balance}>
      {(control) => <MoneyInput {...control} value={balance} onChange={setBalance} quickAmounts />}
    </FormField>
    <FormField label="소유자">
      {(_, { labelId }) => <SegmentedControl aria-labelledby={labelId} fullWidth options={owners} value={owner} onValueChange={setOwner} />}
    </FormField>
  </div>
</ResponsiveDialog>
```

| 컴포넌트 | props | 메모 |
|----------|-------|------|
| `ResponsiveDialog` | `open` `onOpenChange` `title` `description?` `children` `footer?` `onSubmit?` | `onSubmit`을 주면 본문+하단을 `<form>`으로 감싼다(`preventDefault` 포함). 본문만 스크롤된다. 제출 뒤 `aria-invalid`인 칸이 있으면 첫 칸으로 포커스와 스크롤을 옮긴다(오류는 `FormField`의 `error`로 표시하면 된다) |
| `FormField` | `label` `description?` `error?` `optional?` `labelAside?` `children` | `children`을 함수로 주면 `{ id, aria-describedby, aria-invalid }`를 받아 컨트롤에 펼친다. 여러 요소로 된 컨트롤은 두 번째 인자의 `labelId`를 `aria-labelledby`로 |
| `MoneyInput` | `value: number \| null` `onChange(v: number \| null)` `allowNegative?` `placeholder?` `quickAmounts?: boolean \| number[]` `disabled?` `id?` `aria-*` | 천 단위 쉼표, 우측 "원", 아래에 한국어 읽기("480만 원"). **빈 값은 `null`이며 0과 다르다.** `quickAmounts`는 +1만·+10만·+100만 칩. `allowNegative`면 ± 버튼이 생긴다 |
| `Input` · `Textarea` (`ui/`) | 기본 HTML 속성 | 높이 48px, 글자 16px |
| `NativeSelect` (`ui/native-select`) | `<select>` 속성, 자식은 `<option>` | 모바일에서 OS 선택기가 뜬다. 선택지가 5개 이상일 때 |
| `SegmentedControl` (`ui/segmented-control`) | `value` `onValueChange` `options: {value, label}[]` `fullWidth?` `size?: "sm" \| "default"` `aria-label` | 2~4개 중 하나. 보기 전환·기간·소유자. 라벨이 길면 칸 안에서 말줄임된다 |
| `Switch` · `Checkbox` · `Slider` (`ui/`) | Radix 속성 | 켜고 끄기 / 여러 개 선택 / 비율·이율. `Label htmlFor`로 연결한다. `Slider`는 `aria-label(ledby)` 필수 |
| `Label` (`ui/label`) | — | `FormField` 밖에서 컨트롤에 이름을 붙일 때 |

규칙

- 금액은 반드시 `MoneyInput`. `type="number"`를 쓰지 않는다.
- 미확인으로 남길 수 있는 금액은 빈 값(`null`)을 그대로 저장한다. 0이나 계획값으로 채우지 않는다.
- 필수 표시(*)는 쓰지 않는다. 선택 항목에만 `optional`을 붙인다.
- 오류는 `FormField error`로 필드 아래에 보여 준다. 저장 중에는 `Button loading`.

## 버튼과 겹쳐 뜨는 것

| 컴포넌트 | props | 메모 |
|----------|-------|------|
| `Button` (`ui/button`) | `variant?: "default" \| "brand" \| "secondary" \| "outline" \| "ghost" \| "destructive" \| "link"` `size?: "sm" \| "default" \| "lg" \| "icon" \| "icon-sm"` `loading?` `asChild?` | 화면(또는 다이얼로그)마다 `default` 주 버튼은 하나. 아이콘만 있는 버튼에는 `aria-label`. 링크처럼 쓰려면 `asChild` + `<Link>` |
| `ConfirmDialog` | `open` `onOpenChange` `title` `description?` `confirmLabel?` `cancelLabel?` `destructive?` `onConfirm` | 삭제·월 마감 등. `onConfirm`이 Promise를 돌려주면 끝날 때까지 "진행 중", 성공하면 닫히고 실패하면 열려 있다 |
| `DropdownMenu…` (`ui/dropdown-menu`) | `DropdownMenuTrigger` `Content` `Item(variant?: "destructive")` `Label` `Separator` `Group` | 행의 ⋯ 메뉴(수정·비활성화·삭제) |
| `Popover…` (`ui/popover`) | `PopoverTrigger` `PopoverContent` | 짧은 부가 내용. 지표 설명은 `InfoTip` |
| `Tooltip…` (`ui/tooltip`) | `TooltipTrigger` `TooltipContent` | 아이콘 버튼 이름 등 **마우스용 힌트만**. 터치로는 열리지 않는다 |
| `Tabs…` (`ui/tabs`) | `TabsList` `TabsTrigger` `TabsContent` | **한 화면 안에서** 내용 전환(계획 \| 실제) |
| `toast()` (`sonner`) | `toast("저장했습니다")`, `toast("…", { description, action })` | 결과 알림. `Toaster`는 루트 레이아웃에 이미 있다 |
| `EmptyState` | `title` `description?` `action?` `icon?` | 목록·차트가 비었을 때. 다음 행동을 버튼으로 |
| `Skeleton` (`ui/skeleton`) | `className` | 불러오는 중. 실제 내용과 같은 크기로 |
| `Dialog…` · `Drawer…` · `AlertDialog…` (`ui/`) | — | 위 컴포넌트의 재료. 보통 직접 쓰지 않는다 |

언제 무엇을 쓰나

| 상황 | 사용 |
|------|------|
| 추가·수정 폼 | `ResponsiveDialog` |
| 되돌리기 어려운 동작 확인 | `ConfirmDialog` (`destructive`는 삭제에만) |
| 저장 성공, 충돌(`ConflictError`) 안내 | `toast()` |
| 지표가 무엇인지 설명 | `InfoTip` |
| 다른 경로로 이동하는 탭 | `SectionTabs` |
| 같은 화면에서 보기 전환 | `Tabs` 또는 `SegmentedControl`(2~4개, 차트 기간 등) |
| 선택지 5개 이상 | `NativeSelect` |

## 차트

`@/components/chart`. 대부분은 `MoneyChart` 하나로 충분하다.

```tsx
<MoneyChart
  type="area"                       // "line"(기본) | "area" | "bar"
  label="최근 12개월 순자산 추이"     // 스크린 리더용 설명 (필수)
  data={rows}                       // [{ month: "2026-11", netWorth: 348200000 }, …]
  xKey="month"                      // 월 키면 축은 "26.11", 툴팁은 "2026년 11월"로 표기
  series={[{ key: "netWorth", label: "순자산" }]}
/>

<MoneyChart
  type="bar" stacked
  label="주머니별 월 저축액"
  data={rows} xKey="month"
  series={[
    { key: "a", label: nameA, color: pocketColor("member-1") },
    { key: "b", label: nameB, color: pocketColor("member-2") },
    { key: "joint", label: "공동", color: pocketColor("joint") },
  ]}
/>
```

| props | 메모 |
|-------|------|
| `series: { key, label, color? }[]` | 색을 생략하면 `chart-1`부터 순서대로. 최대 6개 |
| `type` | `line`: 여러 계열 추이 비교 · `area`: 단일 계열 추이 · `bar`: 월별 크기 비교 |
| `stacked` | bar·area를 쌓는다. 합계가 의미 있을 때만 |
| `height` | px, 기본 240 (축 눈금 포함) |
| 값이 `null` | 미확인. 선이 끊기고 툴팁에 "미확인"으로 나온다 |

기본으로 들어 있는 것: 금액 축(만·억 단위, `formatAxisWon`. 값이 모두 같거나 거의 같아도 눈금 글자가 겹치지 않게 범위를 넓힌다 — `moneyAxis`), 가로 실선 격자, 툴팁(그 지점의 모든 계열, 값 강조), 계열이 2개 이상이면 범례, 스크린 리더용 표, 라이트/다크 대응(CSS 변수).

규칙

- **y축은 하나.** 단위나 크기가 다른 값(금액과 비율 등)은 차트를 나눈다.
- 색은 대상에 붙는다. 같은 사람·같은 자산 유형은 어느 차트에서나 같은 색을 쓰고, 순위나 필터에 따라 바꾸지 않는다.
- 계열이 6개를 넘으면 "기타"로 묶거나 표로 보여 준다.
- 값 하나, 비율 하나는 차트가 아니라 `Stat`·`Progress`로 보여 준다. 도넛·파이는 쓰지 않는다.
- 차트 안의 글자는 본문 색(`foreground`·`muted-foreground`)만 쓴다. 계열 색은 선·막대·표식에만.
- 다른 형태가 필요하면 `ChartContainer` + Recharts를 직접 조합하고 `chartGridProps` · `chartXAxisProps` · `chartMoneyYAxisProps` · `ChartTooltipContent` · `ChartLegend` · `CHART_COLORS`를 그대로 쓴다. 새 차트 형태를 만들 때는 색·표식 규칙(굵기 2px 선, 24px 이하 막대, 실선 격자)을 유지한다.

## 확인 목록

- 360px 폭에서 가로 스크롤이 없다(1억 이상 금액과 30자 이름을 넣어 확인).
- 반응형 그리드에는 모바일용 `grid-cols-1`을 명시한다(`grid grid-cols-1 lg:grid-cols-3`). 열을 지정하지 않은 그리드는 가장 긴 내용만큼 넓어져 `truncate`가 듣지 않고 가로 스크롤이 생긴다. 직접 열을 쓸 때는 `minmax(0,1fr)`을 쓴다.
- 라이트·다크 모두에서 본문 대비가 충분하다.
- 터치 대상이 44px 이상이다.
- 키보드로 모든 조작이 가능하고 포커스 링이 보인다.
- 미확인(`null`)과 0원이 화면에서 구분된다.

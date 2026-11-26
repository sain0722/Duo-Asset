import { Delta, Money } from "@/components/money";
import { Stat } from "@/components/stat";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { basisText } from "@/lib/data/derive";
import type { Won } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";

import type { HeroView } from "./home-model";
import { AssetsTip, LiabilitiesTip, LiquidTip, NetWorthTip } from "./terms";

export function NetWorthHero({ hero, freeLiquid, className }: { hero: HeroView; freeLiquid: Won; className?: string }) {
  const { totals, basis, change } = hero;
  const showFree = freeLiquid !== totals.liquid;

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Stat
            size="lg"
            label="순자산"
            info={<NetWorthTip />}
            value={<Money amount={totals.netWorth} />}
            sub={
              change && (
                <>
                  <span>{formatMonthOnly(change.since)} 말보다</span>
                  <Delta amount={change.amount} />
                </>
              )
            }
          />
          <p className="text-caption text-muted-foreground">{basisText(basis)}</p>
        </div>
        <Separator />
        <dl className="grid gap-3.5 sm:grid-cols-3 sm:gap-6">
          <HeroItem label="총자산" info={<AssetsTip />} amount={totals.assets} />
          <HeroItem label="총부채" info={<LiabilitiesTip />} amount={totals.liabilities} />
          <HeroItem
            label="가용자산"
            info={<LiquidTip />}
            amount={totals.liquid}
            sub={
              showFree && (
                <>
                  여유 가용자산 <Money amount={freeLiquid} className="font-medium text-foreground" />
                </>
              )
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function HeroItem({
  label,
  info,
  amount,
  sub,
}: {
  label: string;
  info: React.ReactNode;
  amount: Won;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
      <dt className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
        {label}
        {info}
      </dt>
      <dd className="flex flex-col items-end gap-0.5 sm:items-start">
        <Money amount={amount} className="text-base font-semibold sm:text-lg" />
        {sub && <span className="text-caption text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

"use client";

import { PageContainer, PageHeader } from "@/components/page";

import { AccountSection, ThemeSection } from "./account-section";
import { DataSection } from "./data-section";
import { HouseholdSection } from "./household-section";
import { InstallSection } from "./install-section";
import { MetricsGlossary } from "./metrics-glossary";

/** 설정. 모바일은 한 줄로, PC 는 왼쪽(사람·계정) · 오른쪽(데이터·도움말) 두 열. */
export function SettingsScreen() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="설정" />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4 sm:gap-5">
          <HouseholdSection />
          <AccountSection />
          <ThemeSection />
        </div>
        <div className="flex flex-col gap-4 sm:gap-5">
          <DataSection />
          <InstallSection />
          <MetricsGlossary />
        </div>
      </div>
    </PageContainer>
  );
}

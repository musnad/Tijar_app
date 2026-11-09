"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { NG_BANKS, banksMatching, type NgBank } from "@/lib/payments/ng-banks";

export function NigerianBankSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const matches = banksMatching(query);
    if (value && !matches.some((row) => row.code === value)) {
      const current = NG_BANKS.find((row) => row.code === value);
      return current ? [current, ...matches] : [{ code: value, name: `Saved bank (${value})` }, ...matches];
    }
    return matches;
  }, [query, value]);

  return (
    <div className="space-y-2">
      <Input
        className="min-h-11 rounded-xl"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search any Nigerian bank"
        autoComplete="off"
        aria-label="Search Nigerian banks"
      />
      <select
        id={id}
        className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.length === 0 ? (
          <option value={value || ""}>No bank matches that search</option>
        ) : (
          options.map((row: NgBank) => (
            <option key={row.code} value={row.code}>
              {row.name}
            </option>
          ))
        )}
      </select>
      <p className="text-[11px] text-muted-foreground">
        {NG_BANKS.length} Nigerian banks and wallets. Search Access, OPay, Palmpay, Moniepoint, Kuda and more.
      </p>
    </div>
  );
}

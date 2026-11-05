"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { HoldToTalk } from "@/features/ai/hold-to-talk";
import { aiPostJson } from "@/lib/ai/seller-ai-client";
import type { SaleExtract } from "@/lib/ai/seller-extract";
import { useTranslation } from "@/lib/i18n/context";
import { createCustomer, listCustomers } from "@/services/customer-service";
import { listProducts } from "@/services/product-service";
import { createTransaction } from "@/services/transaction-service";

export function VoiceSalePanel({
  businessId,
  profileId,
  language,
}: {
  businessId: string;
  profileId: string;
  language: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [sale, setSale] = useState<SaleExtract | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function runExtract(raw: string) {
    setText(raw);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await aiPostJson<{ sale: SaleExtract }>("/api/ai/sale", { text: raw, language });
      setSale(res.sale);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.ai.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!sale) return;
    setSaving(true);
    setError(null);
    try {
      const [{ data: customers }, { data: products }] = await Promise.all([
        listCustomers(businessId),
        listProducts(businessId),
      ]);
      const nameKey = sale.customerName.trim().toLowerCase();
      let customer = customers.find((c) => c.name.trim().toLowerCase() === nameKey);
      if (!customer) {
        customer = customers.find((c) => c.name.trim().toLowerCase().includes(nameKey) || nameKey.includes(c.name.trim().toLowerCase()));
      }
      if (!customer) {
        const created = await createCustomer(businessId, { name: sale.customerName });
        if (!created.customer) throw new Error(created.error || "Could not save this customer.");
        customer = created.customer;
      }

      const productKey = (sale.productName ?? "").trim().toLowerCase();
      const product = productKey
        ? products.find((p) => p.name.trim().toLowerCase() === productKey) ??
          products.find((p) => p.name.trim().toLowerCase().includes(productKey) || productKey.includes(p.name.trim().toLowerCase()))
        : undefined;

      const qty = sale.quantity > 0 ? sale.quantity : 1;
      const unitPrice = sale.priceNaira ?? (product?.sale_price != null ? Number(product.sale_price) : null);
      if (unitPrice == null || unitPrice <= 0) {
        throw new Error(t("app.ai.needPrice"));
      }
      const amount = unitPrice * (product ? qty : 1);

      const { transaction, error: txError } = await createTransaction(businessId, profileId, {
        type: "sale",
        amount,
        paymentMethod: sale.onCredit ? "credit" : "cash",
        customerId: customer.id,
        productId: product?.id,
        quantity: product ? qty : undefined,
        description: sale.notes || sale.productName || sale.customerName,
        occurredAt: sale.occurredAt ?? undefined,
      });
      if (!transaction) throw new Error(txError || t("app.ai.saveFailed"));
      setResult(
        sale.onCredit
          ? t("app.ai.debtSaved").replace("{name}", customer.name)
          : t("app.ai.saleSaved").replace("{name}", customer.name),
      );
      toast.success(t("app.ai.saleRecorded"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("app.ai.saleHint")}</p>
      <HoldToTalk language={language} onTranscript={(s) => void runExtract(s)} label={t("app.ai.holdSpeak")} />
      <textarea
        className="min-h-24 w-full rounded-2xl border border-input bg-background px-3 py-2 text-base"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("app.ai.salePlaceholder")}
      />
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-xl"
        disabled={loading || text.trim().length < 3}
        onClick={() => void runExtract(text)}
      >
        {loading ? t("app.ai.working") : t("app.ai.useText")}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {sale ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
          <p>
            <strong>{t("app.ai.customer")}:</strong> {sale.customerName}
          </p>
          <p>
            <strong>{t("app.ai.productName")}:</strong> {sale.productName || "—"}
          </p>
          <p>
            <strong>{t("app.ai.qty")}:</strong> {sale.quantity}
          </p>
          <p>
            <strong>{t("app.ai.price")}:</strong> {sale.priceNaira != null ? `₦${sale.priceNaira}` : t("app.ai.fromStock")}
          </p>
          <p>
            <strong>{t("app.ai.pay")}:</strong> {sale.onCredit ? t("app.ai.credit") : t("app.ai.cash")}
          </p>
          <Button
            type="button"
            className="mt-2 min-h-12 w-full rounded-xl bg-[#00B86B] text-white hover:bg-[#00A05E]"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? t("app.ai.saving") : t("app.ai.saveSale")}
          </Button>
        </div>
      ) : null}
      {result ? <p className="rounded-xl bg-[#E8F8F0] px-3 py-2 text-sm font-medium text-[#0A2540]">{result}</p> : null}
    </section>
  );
}

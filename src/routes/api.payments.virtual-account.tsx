import { createFileRoute } from "@tanstack/react-router";

import { corvConfigured, corvCreateVirtualAccount } from "@/lib/payments/corv";
import { shopAdminClient, syncCorvWallet } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/payments/virtual-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const businessId = url.searchParams.get("businessId")?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        const full = await ctx.admin
          .from("businesses")
          .select(
            "business_name, virtual_account_name, virtual_account_number, virtual_account_bank_name, virtual_account_bank_code, virtual_account_reference, virtual_accounts, payout_account_name, payout_account_number, payout_bank_name, payout_bank_code",
          )
          .eq("id", businessId)
          .maybeSingle();
        const { data: biz } = full.error
          ? await ctx.admin
              .from("businesses")
              .select(
                "business_name, virtual_account_name, virtual_account_number, virtual_account_bank_name, virtual_account_bank_code, virtual_account_reference, payout_account_name, payout_account_number, payout_bank_name, payout_bank_code",
              )
              .eq("id", businessId)
              .maybeSingle()
          : full;
        const extras = Array.isArray(biz?.virtual_accounts)
          ? (biz.virtual_accounts as Array<{ accountNumber?: string; account_number?: string; reference?: string }>).map(
              (row) => ({
                ...row,
                accountNumber: row.accountNumber || row.account_number,
              }),
            )
          : [];
        const account = biz?.virtual_account_number
          ? {
              accountName: biz.virtual_account_name,
              accountNumber: biz.virtual_account_number,
              bankName: biz.virtual_account_bank_name,
              bankCode: biz.virtual_account_bank_code,
              reference: biz.virtual_account_reference,
            }
          : null;
        const accounts = [
          ...(account ? [account] : []),
          ...extras.filter(
            (row) =>
              row.accountNumber &&
              (!account || String(row.accountNumber).replace(/\D/g, "") !== String(account.accountNumber).replace(/\D/g, "")),
          ),
        ];
        const synced = await syncCorvWallet(
          ctx.admin,
          businessId,
          (accounts as Array<{ accountNumber?: string; reference?: string }>).map((row) => ({
            accountNumber: row.accountNumber,
            reference: row.reference ?? account?.reference,
          })),
        );
        const activity = synced.activity;
        const { data: wallet } = await ctx.admin
          .from("seller_wallets")
          .select("available_ngn, pending_ngn")
          .eq("business_id", businessId)
          .maybeSingle();
        const owned = new Set(
          (accounts as Array<{ accountNumber?: string }>)
            .map((row) => String(row.accountNumber ?? "").replace(/\D/g, ""))
            .filter((nuban) => nuban.length >= 8),
        );
        const { data: creditRows } = await ctx.admin
          .from("wallet_credits")
          .select("id, business_id, provider, provider_reference, amount_ngn, account_number, created_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(80);
        const credits = (creditRows ?? []).filter((row) => {
          const nuban = String(row.account_number ?? "").replace(/\D/g, "");
          return owned.size > 0 && owned.has(nuban);
        }).slice(0, 40);
        const available = synced.available;
        return Response.json(
          {
            configured: corvConfigured(),
            banks: [],
            account,
            accounts,
            activity,
            payout: biz?.payout_account_number
              ? {
                  accountName: biz.payout_account_name,
                  accountNumber: biz.payout_account_number,
                  bankName: biz.payout_bank_name,
                  bankCode: biz.payout_bank_code,
                }
              : null,
            wallet: {
              available_ngn: available,
              pending_ngn: Number(wallet?.pending_ngn ?? 0),
            },
            credits: credits ?? [],
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        if (!corvConfigured()) {
          return Response.json(
            {
              error:
                "Corv is not connected on the server. Add CORV_SECRET_KEY in Vercel Environment Variables for Production, then redeploy.",
              missing: ["CORV_SECRET_KEY"],
            },
            { status: 503 },
          );
        }
        const body = (await request.json()) as {
          businessId?: string;
          idType?: string;
          idNumber?: string;
          bvn?: string;
        };
        const businessId = body.businessId?.trim();
        const idNumber = (body.idNumber || body.bvn || "").replace(/\D/g, "");
        const idType = body.idType === "nin" ? "nin" : "bvn";
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        if (idNumber.length !== 11) {
          return Response.json(
            { error: "Corv needs the shop owner’s 11-digit BVN or NIN to open the account.", needsBvn: true },
            { status: 400 },
          );
        }
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;

        const { data: biz } = await ctx.admin
          .from("businesses")
          .select(
            "business_name, virtual_account_name, virtual_account_number, virtual_account_bank_name, virtual_account_bank_code, virtual_account_reference, virtual_accounts",
          )
          .eq("id", businessId)
          .maybeSingle();
        if (biz?.virtual_account_number) {
          const extras = Array.isArray(biz.virtual_accounts) ? biz.virtual_accounts : [];
          return Response.json({
            ok: true,
            account: {
              accountName: biz.virtual_account_name,
              accountNumber: biz.virtual_account_number,
              bankName: biz.virtual_account_bank_name,
              bankCode: biz.virtual_account_bank_code,
              reference: biz.virtual_account_reference,
            },
            accounts: extras.length
              ? extras
              : [
                  {
                    accountName: biz.virtual_account_name,
                    accountNumber: biz.virtual_account_number,
                    bankName: biz.virtual_account_bank_name,
                  },
                ],
          });
        }

        const accountName = String(biz?.business_name || ctx.profile.full_name || "TIJAR shop").slice(0, 80);
        const ownerName = String(ctx.profile.full_name || accountName).slice(0, 80);
        const email = ctx.profile.email || `shop-${businessId.slice(0, 8)}@tijar.ng`;
        let created;
        try {
          created = await corvCreateVirtualAccount({
            accountName,
            email,
            phone: ctx.profile.phone ?? undefined,
            idType,
            idNumber,
          });
          if (created.error && ownerName !== accountName) {
            created = await corvCreateVirtualAccount({
              accountName: ownerName,
              email,
              phone: ctx.profile.phone ?? undefined,
              idType,
              idNumber,
            });
          }
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Could not reach Corv." },
            { status: 502 },
          );
        }
        if (created.error || !created.account) {
          return Response.json(
            { error: created.error ?? "Could not create virtual account.", needsBvn: created.needsBvn },
            { status: created.needsBvn ? 400 : 502 },
          );
        }

        const primary = created.account;
        const accounts = created.accounts.map((row) => ({
          accountNumber: row.accountNumber,
          accountName: row.accountName || accountName,
          bankName: row.bankName,
          bankCode: row.bankCode,
          bank: row.bank,
          reference: row.reference,
        }));
        const saved = await ctx.admin
          .from("businesses")
          .update({
            virtual_account_name: accountName,
            virtual_account_number: primary.accountNumber,
            virtual_account_bank_name: primary.bankName,
            virtual_account_bank_code: primary.bank ?? primary.bankCode,
            virtual_account_reference: primary.reference ?? primary.id,
            virtual_account_provider: "corv",
            virtual_accounts: accounts,
            updated_at: new Date().toISOString(),
          })
          .eq("id", businessId);
        if (saved.error) {
          const retry = await ctx.admin
            .from("businesses")
            .update({
              virtual_account_name: accountName,
              virtual_account_number: primary.accountNumber,
              virtual_account_bank_name: primary.bankName,
              virtual_account_bank_code: primary.bank ?? primary.bankCode,
              virtual_account_reference: primary.reference ?? primary.id,
              virtual_account_provider: "corv",
              updated_at: new Date().toISOString(),
            })
            .eq("id", businessId);
          if (retry.error) {
            return Response.json(
              {
                error: retry.error.message.includes("virtual_account")
                  ? "Run the shop wallet SQL migration in Supabase, then try again."
                  : retry.error.message,
              },
              { status: 500 },
            );
          }
        }
        await ctx.admin.rpc("credit_seller_wallet", { p_business_id: businessId, p_amount: 0 });

        return Response.json({
          ok: true,
          account: { ...primary, accountName },
          accounts,
        });
      },
    },
  },
});

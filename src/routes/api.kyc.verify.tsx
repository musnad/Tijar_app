import { createFileRoute } from "@tanstack/react-router";

import { bytidConfigured, bytidIdentityLookup, digitsId, namesMatchRecord, type BytidIdKind } from "@/lib/kyc/bytid";
import { shopAdminClient } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/kyc/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const businessId = url.searchParams.get("businessId")?.trim();
        if (!businessId) return Response.json({ configured: bytidConfigured() });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        const { data: biz } = await ctx.admin
          .from("businesses")
          .select("verification_status, kyc_id_type, kyc_id_last4, kyc_full_name, kyc_verified_at, owner_id")
          .eq("id", businessId)
          .maybeSingle();
        return Response.json({
          configured: bytidConfigured(),
          verificationStatus: biz?.verification_status ?? "unverified",
          kyc: biz?.kyc_verified_at
            ? {
                idType: biz.kyc_id_type,
                last4: biz.kyc_id_last4,
                fullName: biz.kyc_full_name,
                verifiedAt: biz.kyc_verified_at,
              }
            : null,
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          businessId?: string;
          idType?: string;
          idNumber?: string;
          firstName?: string;
          lastName?: string;
          dob?: string;
        };
        const businessId = body.businessId?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;

        const { data: owned } = await ctx.admin
          .from("businesses")
          .select("id, owner_id, verification_status, kyc_verified_at, kyc_full_name, kyc_id_type, kyc_id_last4")
          .eq("id", businessId)
          .eq("owner_id", ctx.profile.id)
          .maybeSingle();
        if (!owned) {
          return Response.json({ error: "Only the shop owner can complete identity verification." }, { status: 403 });
        }
        if (owned.verification_status === "verified" && owned.kyc_verified_at) {
          return Response.json({
            ok: true,
            alreadyVerified: true,
            message: "This shop is already verified.",
            fullName: owned.kyc_full_name,
            last4: owned.kyc_id_last4,
            idType: owned.kyc_id_type,
          });
        }

        const kind: BytidIdKind = body.idType === "nin" ? "nin" : "bvn";
        const idNumber = digitsId(body.idNumber);
        const firstName = String(body.firstName ?? "").trim();
        const lastName = String(body.lastName ?? "").trim();
        const dob = String(body.dob ?? "").trim();
        const last4 = idNumber.slice(-4);
        const reference = `tijar-kyc-${businessId.replace(/-/g, "").slice(0, 12)}-${Date.now().toString(36)}`;

        const lookup = await bytidIdentityLookup({
          kind,
          idNumber,
          firstName,
          lastName,
          dob: dob || undefined,
          reference,
        });

        const matched = lookup.ok && namesMatchRecord(lookup);
        const checkStatus = !lookup.ok
          ? lookup.status === "not_found"
            ? "not_found"
            : lookup.status === "invalid"
              ? "invalid"
              : "failed"
          : matched
            ? "verified"
            : "mismatch";

        await ctx.admin.from("business_kyc_checks").insert({
          business_id: businessId,
          profile_id: ctx.profile.id,
          id_type: kind,
          id_last4: last4 || null,
          status: checkStatus,
          provider: "bytid",
          provider_reference: lookup.reference ?? reference,
          message: lookup.error ?? lookup.message ?? null,
        });

        if (!lookup.ok) {
          return Response.json({ error: lookup.error ?? "Verification failed.", code: lookup.status }, { status: lookup.httpStatus ?? 502 });
        }
        if (!matched) {
          return Response.json(
            {
              error: "The name does not match this ID. Check the first and last name on the BVN/NIN.",
              code: "NAME_MISMATCH",
            },
            { status: 400 },
          );
        }

        const fullName = lookup.fullName || `${lookup.firstName ?? firstName} ${lookup.lastName ?? lastName}`.trim();
        const { error: saveError } = await ctx.admin
          .from("businesses")
          .update({
            verification_status: "verified",
            kyc_provider: "bytid",
            kyc_id_type: kind,
            kyc_id_last4: last4,
            kyc_full_name: fullName,
            kyc_verified_at: new Date().toISOString(),
            kyc_reference: lookup.reference ?? reference,
            moderation_notes: `${kind.toUpperCase()} verified via Bytid (****${last4}). Blue tick is still separate.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", businessId);
        if (saveError) {
          const missing = /kyc_/i.test(saveError.message);
          if (missing) {
            await ctx.admin
              .from("businesses")
              .update({
                verification_status: "verified",
                moderation_notes: `${kind.toUpperCase()} verified via Bytid (****${last4}). Run the KYC SQL in Supabase to store ID details.`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", businessId);
          } else {
            return Response.json({ error: "Identity matched, but the shop record could not be updated." }, { status: 500 });
          }
        }

        return Response.json({
          ok: true,
          message: `Verified as ${fullName}.`,
          fullName,
          last4,
          idType: kind,
        });
      },
    },
  },
});

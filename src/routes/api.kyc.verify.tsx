import { createFileRoute } from "@tanstack/react-router";

import {
  bytidCacLookup,
  bytidConfigured,
  bytidNinFaceMatch,
  digitsId,
  faceMatched,
  namesMatchRecord,
  normalizeCacNumber,
} from "@/lib/kyc/bytid";
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
          .select(
            "verification_status, kyc_id_type, kyc_id_last4, kyc_full_name, kyc_verified_at, kyc_details, kyc_face_matched, cac_number, cac_legal_name, cac_status, cac_verified_at",
          )
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
                faceMatched: Boolean(biz.kyc_face_matched),
                details: biz.kyc_details,
              }
            : null,
          cac: biz?.cac_number
            ? {
                number: biz.cac_number,
                legalName: biz.cac_legal_name,
                status: biz.cac_status,
                verifiedAt: biz.cac_verified_at,
              }
            : null,
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          action?: string;
          businessId?: string;
          idNumber?: string;
          firstName?: string;
          lastName?: string;
          dob?: string;
          selfieImage?: string;
          cacNumber?: string;
        };
        const businessId = body.businessId?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;

        const { data: owned } = await ctx.admin
          .from("businesses")
          .select("id, owner_id, verification_status, kyc_verified_at, kyc_full_name, kyc_id_last4, kyc_details")
          .eq("id", businessId)
          .eq("owner_id", ctx.profile.id)
          .maybeSingle();
        if (!owned) {
          return Response.json({ error: "Only the shop owner can complete identity verification." }, { status: 403 });
        }

        if (body.action === "cac") {
          return saveOptionalCac(ctx.admin, businessId, ctx.profile.id, body.cacNumber);
        }

        if (owned.verification_status === "verified" && owned.kyc_verified_at) {
          if (body.cacNumber) {
            const cac = await saveOptionalCac(ctx.admin, businessId, ctx.profile.id, body.cacNumber);
            if (!cac.ok) return cac;
            return Response.json({
              ok: true,
              alreadyVerified: true,
              message: "Shop already verified. CAC details saved.",
              fullName: owned.kyc_full_name,
              last4: owned.kyc_id_last4,
            });
          }
          return Response.json({
            ok: true,
            alreadyVerified: true,
            message: "This shop is already verified.",
            fullName: owned.kyc_full_name,
            last4: owned.kyc_id_last4,
            idType: "nin",
          });
        }

        const idNumber = digitsId(body.idNumber);
        const firstName = String(body.firstName ?? "").trim();
        const lastName = String(body.lastName ?? "").trim();
        const dob = String(body.dob ?? "").trim();
        const selfieImage = String(body.selfieImage ?? "").trim();
        const last4 = idNumber.slice(-4);
        const reference = `tijar-nin-${businessId.replace(/-/g, "").slice(0, 10)}-${Date.now().toString(36)}`;

        const lookup = await bytidNinFaceMatch({
          idNumber,
          firstName,
          lastName,
          dob: dob || undefined,
          selfieImage,
          reference,
        });

        const nameOk = lookup.ok && namesMatchRecord(lookup);
        const faceOk = faceMatched(lookup);
        const checkStatus = !lookup.ok
          ? lookup.status === "not_found"
            ? "not_found"
            : lookup.status === "invalid"
              ? "invalid"
              : "failed"
          : !nameOk
            ? "mismatch"
            : !faceOk
              ? "face_mismatch"
              : "verified";

        const details = {
          id_type: "nin",
          masked_id: lookup.maskedId ?? `*****${last4}`,
          last4,
          full_name: lookup.fullName,
          first_name: lookup.firstName,
          last_name: lookup.lastName,
          middle_name: lookup.middleName,
          date_of_birth: lookup.dateOfBirth,
          gender: lookup.gender,
          phone_number: lookup.phone,
          state_of_origin: lookup.stateOfOrigin,
          nationality: lookup.nationality,
          face: lookup.face,
        };

        await ctx.admin.from("business_kyc_checks").insert({
          business_id: businessId,
          profile_id: ctx.profile.id,
          id_type: "nin",
          id_last4: last4 || null,
          status: checkStatus,
          provider: "bytid",
          provider_reference: lookup.reference ?? reference,
          message: lookup.error ?? lookup.message ?? null,
          details,
          face_status: lookup.face?.status ?? null,
          face_score: lookup.face?.score ?? null,
        });

        if (!lookup.ok) {
          return Response.json({ error: lookup.error ?? "Verification failed.", code: lookup.status }, { status: lookup.httpStatus ?? 502 });
        }
        if (!nameOk) {
          return Response.json(
            { error: "The name does not match this NIN. Use the name on the ID.", code: "NAME_MISMATCH" },
            { status: 400 },
          );
        }
        if (!faceOk) {
          const reason =
            lookup.face?.status === "unavailable"
              ? "We could not match your face. Take a clearer selfie in good light, facing the camera."
              : "Your selfie does not match the photo on this NIN.";
          return Response.json({ error: reason, code: "FACE_MISMATCH" }, { status: 400 });
        }

        const fullName = lookup.fullName || `${lookup.firstName ?? firstName} ${lookup.lastName ?? lastName}`.trim();
        const patch = {
          verification_status: "verified",
          kyc_provider: "bytid",
          kyc_id_type: "nin",
          kyc_id_last4: last4,
          kyc_full_name: fullName,
          kyc_verified_at: new Date().toISOString(),
          kyc_reference: lookup.reference ?? reference,
          kyc_details: details,
          kyc_face_matched: true,
          kyc_dob: lookup.dateOfBirth,
          kyc_phone: lookup.phone,
          kyc_gender: lookup.gender,
          kyc_state: lookup.stateOfOrigin,
          kyc_masked_id: lookup.maskedId ?? `*****${last4}`,
          moderation_notes: `NIN + face auto-verified via Bytid (${lookup.maskedId ?? `****${last4}`}).`,
          updated_at: new Date().toISOString(),
        };
        const { error: saveError } = await ctx.admin.from("businesses").update(patch).eq("id", businessId);
        if (saveError) {
          await ctx.admin
            .from("businesses")
            .update({
              verification_status: "verified",
              moderation_notes: `NIN + face auto-verified via Bytid (****${last4}). Run the latest KYC SQL to store ID details.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", businessId);
        }

        let cacMessage = "";
        if (body.cacNumber) {
          const cacRes = await saveOptionalCac(ctx.admin, businessId, ctx.profile.id, body.cacNumber);
          if (!cacRes.ok) {
            const json = (await cacRes.json()) as { error?: string };
            cacMessage = ` NIN verified. CAC skipped: ${json.error ?? "could not verify CAC."}`;
          } else {
            cacMessage = " CAC saved.";
          }
        }

        return Response.json({
          ok: true,
          autoVerified: true,
          message: `Verified as ${fullName}.${cacMessage}`.trim(),
          fullName,
          last4,
          idType: "nin",
          details,
        });
      },
    },
  },
});

async function saveOptionalCac(
  admin: import("@supabase/supabase-js").SupabaseClient,
  businessId: string,
  profileId: string,
  cacRaw: unknown,
): Promise<Response> {
  const cacNumber = normalizeCacNumber(cacRaw);
  if (cacNumber.length < 5) {
    return Response.json({ error: "Enter a CAC number such as RC123456." }, { status: 400 });
  }
  const reference = `tijar-cac-${businessId.replace(/-/g, "").slice(0, 10)}-${Date.now().toString(36)}`;
  const lookup = await bytidCacLookup({ cacNumber, reference });
  await admin.from("business_kyc_checks").insert({
    business_id: businessId,
    profile_id: profileId,
    id_type: "cac",
    id_last4: cacNumber.slice(-4),
    status: lookup.ok ? "verified" : lookup.status,
    provider: "bytid",
    provider_reference: reference,
    message: lookup.error ?? null,
    details: lookup.details ?? {
      legal_name: lookup.legalName,
      registration_number: lookup.registrationNumber,
      status: lookup.companyStatus,
      address: lookup.address,
      directors: lookup.directors,
    },
  });
  if (!lookup.ok) {
    return Response.json({ error: lookup.error ?? "CAC lookup failed.", code: lookup.status }, { status: lookup.httpStatus ?? 502 });
  }
  const cacDetails = {
    number: lookup.registrationNumber ?? cacNumber,
    legal_name: lookup.legalName,
    status: lookup.companyStatus,
    address: lookup.address,
    company_type: lookup.companyType,
    directors: lookup.directors,
  };
  await admin
    .from("businesses")
    .update({
      cac_number: cacDetails.number,
      cac_legal_name: lookup.legalName,
      cac_status: lookup.companyStatus,
      cac_verified_at: new Date().toISOString(),
      cac_details: cacDetails,
      updated_at: new Date().toISOString(),
    })
    .eq("id", businessId);
  return Response.json({
    ok: true,
    message: `CAC saved${lookup.legalName ? `: ${lookup.legalName}` : "."}`,
    cac: cacDetails,
  });
}

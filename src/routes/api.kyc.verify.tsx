import { createFileRoute } from "@tanstack/react-router";

import {
  bytidCacLookup,
  bytidConfigured,
  bytidCreateLiveness,
  bytidGetLiveness,
  bytidNinLiveFaceMatch,
  bytidNinLookup,
  digitsId,
  faceMatched,
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
          verificationStatus: biz?.verification_status ?? "not_started",
          kyc: biz?.kyc_full_name
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
          livenessSessionId?: string;
          redirectUrl?: string;
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
          return Response.json({
            ok: true,
            alreadyVerified: true,
            message: "This shop is already verified.",
            person: owned.kyc_details,
            fullName: owned.kyc_full_name,
          });
        }

        if (body.action === "nin-lookup" || !body.action) {
          const idNumber = digitsId(body.idNumber);
          const last4 = idNumber.slice(-4);
          const reference = `tijar-nin-${businessId.replace(/-/g, "").slice(0, 10)}-${Date.now().toString(36)}`;
          const lookup = await bytidNinLookup({ idNumber, reference });
          await ctx.admin.from("business_kyc_checks").insert({
            business_id: businessId,
            profile_id: ctx.profile.id,
            id_type: "nin",
            id_last4: last4 || null,
            status: lookup.ok ? "nin_found" : lookup.status,
            provider: "bytid",
            provider_reference: lookup.reference ?? reference,
            message: lookup.error ?? lookup.message ?? null,
            details: lookup.person,
          });
          if (!lookup.ok) {
            return Response.json({ error: lookup.error ?? "NIN lookup failed.", code: lookup.status }, { status: lookup.httpStatus && lookup.httpStatus >= 400 ? lookup.httpStatus : 400 });
          }
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
            step: "nin_found",
          };
          await ctx.admin
            .from("businesses")
            .update({
              verification_status: "in_progress",
              kyc_provider: "bytid",
              kyc_id_type: "nin",
              kyc_id_last4: last4,
              kyc_full_name: lookup.fullName,
              kyc_dob: lookup.dateOfBirth,
              kyc_phone: lookup.phone,
              kyc_gender: lookup.gender,
              kyc_state: lookup.stateOfOrigin,
              kyc_masked_id: details.masked_id,
              kyc_details: details,
              kyc_face_matched: false,
              kyc_verified_at: null,
              kyc_reference: lookup.reference ?? reference,
              moderation_notes: "NIN found. Waiting for live face check.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", businessId);
          return Response.json({
            ok: true,
            step: "nin_found",
            message: "NIN found. Confirm the name, then complete live face verification.",
            person: details,
          });
        }

        if (body.action === "liveness-start") {
          const redirectUrl = String(body.redirectUrl ?? "").trim();
          if (!/^https:\/\//i.test(redirectUrl)) {
            return Response.json({ error: "Live face needs a secure return URL." }, { status: 400 });
          }
          const reference = `tijar-live-${businessId.replace(/-/g, "").slice(0, 10)}-${Date.now().toString(36)}`;
          const session = await bytidCreateLiveness({ reference, redirectUrl });
          if (!session.ok || !session.url || !session.id) {
            return Response.json({ error: session.error ?? "Could not start live face check." }, { status: session.httpStatus ?? 502 });
          }
          return Response.json({ ok: true, sessionId: session.id, url: session.url });
        }

        if (body.action === "nin-liveness") {
          const idNumber = digitsId(body.idNumber);
          const sessionId = String(body.livenessSessionId ?? "").trim();
          if (!sessionId) {
            return Response.json({ error: "Finish the live camera check first." }, { status: 400 });
          }
          const live = await bytidGetLiveness(sessionId);
          if (!live.ok) {
            return Response.json({ error: live.error ?? "Could not read the live face session." }, { status: live.httpStatus ?? 502 });
          }
          if (live.status !== "passed" || !live.usableForFaceMatch) {
            return Response.json(
              { error: "Live face check did not pass. Try again in good light, facing the camera." },
              { status: 400 },
            );
          }
          const saved = (owned.kyc_details ?? {}) as Record<string, unknown>;
          const reference = `tijar-face-${businessId.replace(/-/g, "").slice(0, 10)}-${Date.now().toString(36)}`;
          const lookup = await bytidNinLiveFaceMatch({
            idNumber,
            firstName: typeof saved.first_name === "string" ? saved.first_name : undefined,
            lastName: typeof saved.last_name === "string" ? saved.last_name : undefined,
            livenessSessionId: sessionId,
            reference,
          });
          const last4 = idNumber.slice(-4);
          await ctx.admin.from("business_kyc_checks").insert({
            business_id: businessId,
            profile_id: ctx.profile.id,
            id_type: "nin_liveness",
            id_last4: last4 || owned.kyc_id_last4,
            status: lookup.ok && faceMatched(lookup) ? "verified" : lookup.face?.status ?? lookup.status,
            provider: "bytid",
            provider_reference: lookup.reference ?? reference,
            message: lookup.error ?? lookup.message ?? null,
            details: { ...lookup.person, face: lookup.face },
            face_status: lookup.face?.status ?? null,
            face_score: lookup.face?.score ?? null,
          });
          if (!lookup.ok) {
            return Response.json({ error: lookup.error ?? "Face match failed.", code: lookup.status }, { status: lookup.httpStatus && lookup.httpStatus >= 400 ? lookup.httpStatus : 400 });
          }
          if (!faceMatched(lookup)) {
            return Response.json(
              { error: "The live face does not match this NIN. Try the camera check again.", code: "FACE_MISMATCH" },
              { status: 400 },
            );
          }
          const fullName = lookup.fullName || owned.kyc_full_name || "Verified owner";
          const details = {
            id_type: "nin",
            masked_id: lookup.maskedId ?? owned.kyc_id_last4,
            last4: last4 || owned.kyc_id_last4,
            full_name: fullName,
            first_name: lookup.firstName,
            last_name: lookup.lastName,
            middle_name: lookup.middleName,
            date_of_birth: lookup.dateOfBirth,
            gender: lookup.gender,
            phone_number: lookup.phone,
            state_of_origin: lookup.stateOfOrigin,
            nationality: lookup.nationality,
            face: lookup.face,
            step: "verified",
          };
          await ctx.admin
            .from("businesses")
            .update({
              verification_status: "verified",
              kyc_provider: "bytid",
              kyc_id_type: "nin",
              kyc_id_last4: last4 || owned.kyc_id_last4,
              kyc_full_name: fullName,
              kyc_verified_at: new Date().toISOString(),
              kyc_reference: lookup.reference ?? reference,
              kyc_details: details,
              kyc_face_matched: true,
              kyc_dob: lookup.dateOfBirth,
              kyc_phone: lookup.phone,
              kyc_gender: lookup.gender,
              kyc_state: lookup.stateOfOrigin,
              kyc_masked_id: details.masked_id,
              moderation_notes: `NIN + live face auto-verified via Bytid (${details.masked_id}).`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", businessId);
          return Response.json({
            ok: true,
            autoVerified: true,
            message: `Verified as ${fullName}.`,
            person: details,
          });
        }

        return Response.json({ error: "Unknown verification step." }, { status: 400 });
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

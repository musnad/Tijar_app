-- Finish the KYC reset. The enum is not_started / submitted / verified / etc — not "unverified".
-- Safe to run even if 000086 already added the new columns.

update public.businesses
set
  verification_status = 'not_started',
  kyc_provider = null,
  kyc_id_type = null,
  kyc_id_last4 = null,
  kyc_full_name = null,
  kyc_verified_at = null,
  kyc_reference = null,
  kyc_details = null,
  kyc_face_matched = false,
  kyc_dob = null,
  kyc_phone = null,
  kyc_gender = null,
  kyc_state = null,
  kyc_masked_id = null,
  cac_number = null,
  cac_legal_name = null,
  cac_status = null,
  cac_verified_at = null,
  cac_details = null,
  moderation_notes = 'Re-verify with NIN and a selfie. CAC is optional.',
  updated_at = now();

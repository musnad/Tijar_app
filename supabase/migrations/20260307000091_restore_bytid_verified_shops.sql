-- Restore shops that already passed NIN + live face on Bytid.
-- Does not change shops that never completed face match.
-- Run this whole file in the Supabase SQL editor.

-- 1) From Tijar's own Bytid check log
update public.businesses b
set
  verification_status = 'verified',
  kyc_provider = coalesce(b.kyc_provider, 'bytid'),
  kyc_id_type = coalesce(b.kyc_id_type, 'nin'),
  kyc_verified_at = coalesce(b.kyc_verified_at, c.created_at, now()),
  kyc_face_matched = true,
  kyc_id_last4 = coalesce(nullif(b.kyc_id_last4, ''), c.id_last4),
  kyc_reference = coalesce(b.kyc_reference, c.provider_reference),
  kyc_full_name = coalesce(
    b.kyc_full_name,
    c.details->>'full_name',
    nullif(trim(concat_ws(' ', c.details->>'first_name', c.details->>'last_name')), '')
  ),
  kyc_masked_id = coalesce(b.kyc_masked_id, c.details->>'masked_id'),
  kyc_details = coalesce(b.kyc_details, c.details),
  moderation_notes = 'Verified on Bytid: NIN + live face matched.',
  updated_at = now()
from (
  select distinct on (business_id) *
  from public.business_kyc_checks
  where provider = 'bytid'
    and (
      status = 'verified'
      or coalesce(face_status, '') = 'matched'
      or provider_reference like 'tijar-face-%'
    )
  order by business_id, created_at desc
) c
where b.id = c.business_id
  and b.kyc_verified_at is null;

-- 2) From Bytid dashboard (sandbox) face-matched references
with bytid_face as (
  select * from (
    values
      ('05ee956896', '257*****569'),
      ('3aedb74866', '313*****912'),
      ('fe12ca1b20', '588*****192'),
      ('11bec3397a', '458*****561'),
      ('98ca79bdde', '460*****660'),
      ('ca260972c8', '785*****692'),
      ('e781420450', '125*****246'),
      ('ba5d4b11c3', '807*****682')
  ) as t(prefix, masked)
)
update public.businesses b
set
  verification_status = 'verified',
  kyc_provider = coalesce(b.kyc_provider, 'bytid'),
  kyc_id_type = coalesce(b.kyc_id_type, 'nin'),
  kyc_verified_at = coalesce(b.kyc_verified_at, now()),
  kyc_face_matched = true,
  kyc_masked_id = coalesce(b.kyc_masked_id, f.masked),
  kyc_reference = coalesce(b.kyc_reference, 'tijar-face-' || f.prefix),
  kyc_details = coalesce(b.kyc_details, jsonb_build_object('step', 'verified', 'masked_id', f.masked)),
  moderation_notes = 'Verified on Bytid: NIN + live face matched.',
  updated_at = now()
from bytid_face f
where replace(b.id::text, '-', '') like f.prefix || '%'
  and b.kyc_verified_at is null;

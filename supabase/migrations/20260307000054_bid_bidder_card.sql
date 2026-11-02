-- Bidder account card.
--
-- An auction is transparent: everyone can see the bids, who is ahead and who
-- bid what. This adds the account behind a bid row so the shop running the
-- bidding can open a bidder and see their real details (name, contact, when
-- they joined, the shops they own). Contact details are only ever returned to
-- the shop that owns the post (or its team / an admin) — never to the public.

create or replace function public.bid_bidder_card(p_post_id uuid, p_bidder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_owner uuid;
  v_winner_id uuid;
  v_can boolean := false;
  v_name text;
  v_avatar text;
  v_bio text;
  v_phone text;
  v_email text;
  v_joined timestamptz;
  v_bid_count int := 0;
  v_top numeric;
  v_last_bid timestamptz;
  v_is_winner boolean := false;
  v_shops jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to view this account.');
  end if;

  select vp.business_id, vp.profile_id, vp.bid_winner_id
    into v_business, v_owner, v_winner_id
  from public.video_posts vp
  where vp.id = p_post_id;

  if v_business is null then
    return jsonb_build_object('ok', false, 'error', 'This bidding no longer exists.');
  end if;

  -- Only the shop running the bidding (owner, team member or an admin) may see
  -- the bidder's private details.
  v_can := (v_owner = public.current_profile_id())
           or public.is_business_member(v_business)
           or public.has_platform_role('admin');

  select p.full_name, p.avatar_url, p.bio, p.phone, p.email, p.created_at
    into v_name, v_avatar, v_bio, v_phone, v_email, v_joined
  from public.profiles p
  where p.id = p_bidder_id;

  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'This account could not be found.');
  end if;

  select count(*), max(o.amount), max(o.created_at)
    into v_bid_count, v_top, v_last_bid
  from public.bid_offers o
  where o.post_id = p_post_id and o.bidder_id = p_bidder_id;

  v_is_winner := (v_winner_id = p_bidder_id);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', b.id,
               'name', b.business_name,
               'slug', b.public_slug,
               'logo_url', b.logo_url
             )
             order by b.business_name
           ),
           '[]'::jsonb
         )
    into v_shops
  from public.businesses b
  where b.owner_id = p_bidder_id;

  return jsonb_build_object(
    'ok', true,
    'can_view_contact', v_can,
    'full_name', v_name,
    'avatar_url', v_avatar,
    'bio', v_bio,
    'phone', case when v_can then v_phone else null end,
    'email', case when v_can then v_email else null end,
    'joined_at', v_joined,
    'bid_count', coalesce(v_bid_count, 0),
    'highest_bid', v_top,
    'last_bid_at', v_last_bid,
    'is_winner', v_is_winner,
    'shops', v_shops
  );
end;
$$;

grant execute on function public.bid_bidder_card(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

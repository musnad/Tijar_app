-- Buyer can pick which delivery business carries an order.

alter table public.orders
  add column if not exists delivery_business_id uuid references public.businesses (id) on delete set null;

alter table public.place_order_requests
  add column if not exists delivery_business_id uuid references public.businesses (id) on delete set null;

notify pgrst, 'reload schema';

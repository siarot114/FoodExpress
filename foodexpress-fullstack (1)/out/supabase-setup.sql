-- FoodExpress database setup.
-- Supabase dashboard > SQL Editor > New query > paste this whole file > Run.

-- 1) Tables -------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  customer_name  text not null check (char_length(customer_name) between 1 and 100),
  address        text not null check (char_length(address)       between 1 and 250),
  phone          text not null check (char_length(phone)         between 1 and 30),
  payment_method text not null check (payment_method in ('Cash on Delivery','GCash','Credit / Debit Card')),
  total          numeric(10,2) not null check (total >= 0),
  status         text not null default 'preparing' check (status in ('preparing','cancelled')),
  cancel_reason  text check (char_length(cancel_reason) <= 400),
  created_at     timestamptz not null default now()
);

create table if not exists public.order_items (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  item_name  text not null check (char_length(item_name) between 1 and 100),
  price      numeric(10,2) not null check (price >= 0),
  quantity   int not null check (quantity between 1 and 50)
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- 2) Row Level Security: each customer sees only their own orders --------
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select to authenticated using (auth.uid() = user_id);

-- A customer may only cancel their own order, and only while it is still preparing.
drop policy if exists "cancel own orders" on public.orders;
create policy "cancel own orders" on public.orders
  for update to authenticated
  using (auth.uid() = user_id and status = 'preparing')
  with check (auth.uid() = user_id and status = 'cancelled');

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Only the status and the cancel reason can ever be changed from the browser.
revoke insert, update, delete on public.orders      from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
grant  update (status, cancel_reason) on public.orders to authenticated;

-- 3) place_order(): saves an order and its items in one safe step ---------
create or replace function public.place_order(
  p_name text, p_address text, p_phone text, p_payment text, p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_total numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to order.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid items.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'An order needs between 1 and 30 items.';
  end if;

  select coalesce(sum((i->>'price')::numeric * (i->>'quantity')::int), 0)
    into v_total
    from jsonb_array_elements(p_items) as i;

  insert into public.orders (id, user_id, customer_name, address, phone, payment_method, total)
  values (v_id, auth.uid(), p_name, p_address, p_phone, p_payment, v_total);

  insert into public.order_items (order_id, item_name, price, quantity)
  select v_id, i->>'name', (i->>'price')::numeric, (i->>'quantity')::int
    from jsonb_array_elements(p_items) as i;

  return v_id;
end;
$$;

revoke all on function public.place_order(text, text, text, text, jsonb) from public, anon;
grant execute on function public.place_order(text, text, text, text, jsonb) to authenticated;

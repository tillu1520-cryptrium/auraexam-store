-- ============================================================================
-- PREMIUM EXAM PREPARATION E-COMMERCE PLATFORM — ENTERPRISE DATABASE SCHEMA
-- Target Database: Supabase PostgreSQL
-- Enforces: Strict RLS, Foreign Keys, Audit Logging, Automated Triggers,
--           Idempotency, and Role-Based Administrative Control.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. CUSTOM ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.order_status as enum (
    'created',
    'payment_pending',
    'paid',
    'payment_failed',
    'cancelled',
    'partially_refunded',
    'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'created',
    'authorized',
    'captured',
    'failed',
    'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_status as enum (
    'pending',
    'processing',
    'delivered',
    'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.refund_status as enum (
    'requested',
    'under_review',
    'eligible',
    'rejected',
    'processing',
    'processed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.admin_role as enum (
    'superadmin',
    'manager',
    'reviewer',
    'support'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- 3. CORE TABLES
-- ----------------------------------------------------------------------------

-- A. Products (Subject-wise 10-set bundles)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  price_paise integer not null check (price_paise > 0),
  drive_file_id text,
  bonus_folder_id text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_current_timestamp_updated_at();

-- B. Bonus & Complementary Resources
create table if not exists public.bonus_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  drive_file_id text not null,
  is_global boolean not null default false,
  product_id uuid references public.products(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_bonus_resources_updated_at on public.bonus_resources;
create trigger set_bonus_resources_updated_at
  before update on public.bonus_resources
  for each row execute function public.set_current_timestamp_updated_at();

-- C. Customers (Deduplicated by normalized email)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  roll_number text not null check (char_length(roll_number) between 1 and 60),
  email text unique not null check (email = lower(trim(email))),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  refund_upi_id text not null check (refund_upi_id ~ '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$'),
  total_orders_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_current_timestamp_updated_at();

-- D. Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid not null references public.customers(id),
  subtotal_paise integer not null check (subtotal_paise > 0),
  discount_paise integer not null default 0 check (discount_paise >= 0),
  total_paise integer not null check (total_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status public.order_status not null default 'created',
  razorpay_order_id text unique,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_current_timestamp_updated_at();

-- E. Order Items (Each item represents one 10-set complete bundle)
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  unit_price_paise integer not null check (unit_price_paise > 0),
  quantity integer not null default 1 check (quantity = 1),
  created_at timestamptz not null default now(),
  unique(order_id, product_id)
);

-- F. Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  gateway text not null default 'razorpay',
  gateway_order_id text not null unique,
  gateway_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status public.payment_status not null default 'created',
  method text,
  bank text,
  wallet text,
  vpa text,
  error_code text,
  error_description text,
  verified_at timestamptz,
  raw_status text,
  created_at timestamptz not null default now()
);

-- G. Deliveries (Private Google Drive PDF Access Records)
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id),
  order_id uuid not null references public.orders(id),
  customer_email text not null,
  product_name text not null,
  drive_file_id text not null,
  status public.delivery_status not null default 'pending',
  attempts integer not null default 0,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_deliveries_updated_at on public.deliveries;
create trigger set_deliveries_updated_at
  before update on public.deliveries
  for each row execute function public.set_current_timestamp_updated_at();

-- H. Refund Requests (75% Policy Implementation)
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  customer_id uuid not null references public.customers(id),
  subject_name text not null,
  exam_date date not null,
  original_amount_paise integer not null check (original_amount_paise > 0),
  refund_ratio numeric(4,2) not null default 0.75 check (refund_ratio between 0.01 and 1.00),
  calculated_refund_paise integer not null check (calculated_refund_paise > 0),
  status public.refund_status not null default 'requested',
  reason text not null,
  evidence_url text,
  evidence_notes text,
  customer_upi_id text not null,
  reviewed_by uuid,
  decision_notes text,
  gateway_refund_id text,
  reviewed_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id)
);

drop trigger if exists set_refunds_updated_at on public.refunds;
create trigger set_refunds_updated_at
  before update on public.refunds
  for each row execute function public.set_current_timestamp_updated_at();

-- I. Admin Users (Authorized Management Accounts)
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  supabase_auth_id uuid unique,
  email text unique not null,
  full_name text not null,
  role public.admin_role not null default 'reviewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_admin_users_updated_at on public.admin_users;
create trigger set_admin_users_updated_at
  before update on public.admin_users
  for each row execute function public.set_current_timestamp_updated_at();

-- J. Webhook Events (Idempotency and Replay Protection)
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null default 'razorpay',
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  unique(gateway, event_id)
);

-- K. Comprehensive Audit Logs
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  safe_metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_razorpay on public.orders(razorpay_order_id);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);

create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_payments_gateway_order on public.payments(gateway_order_id);
create index if not exists idx_payments_gateway_payment on public.payments(gateway_payment_id);

create index if not exists idx_deliveries_order_id on public.deliveries(order_id);
create index if not exists idx_deliveries_status on public.deliveries(status);
create index if not exists idx_deliveries_customer_email on public.deliveries(customer_email);

create index if not exists idx_refunds_order_id on public.refunds(order_id);
create index if not exists idx_refunds_status on public.refunds(status);
create index if not exists idx_refunds_created_at on public.refunds(created_at desc);

create index if not exists idx_webhook_events_lookup on public.webhook_events(gateway, event_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) & RESTRICTED VIEWS
-- ----------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.bonus_resources enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;
alter table public.refunds enable row level security;
alter table public.admin_users enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;

-- Revoke raw table access from public / unprivileged users
revoke all on public.products from anon, authenticated;
revoke all on public.bonus_resources from anon, authenticated;
revoke all on public.customers from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.deliveries from anon, authenticated;
revoke all on public.refunds from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

-- Public Safe View: Exposes only active catalogue data (NEVER reveals drive_file_id)
create or replace view public.public_products with (security_invoker = false) as
  select
    id,
    slug,
    name,
    description,
    price_paise,
    display_order
  from public.products
  where active = true;

grant select on public.public_products to anon, authenticated;

-- Public Safe View: Exposes available bonus / complementary resources metadata
create or replace view public.public_bonus_resources with (security_invoker = false) as
  select
    id,
    title,
    description,
    is_global,
    product_id
  from public.bonus_resources
  where active = true;

grant select on public.public_bonus_resources to anon, authenticated;

-- Admin RLS Policies: Allow authenticated admin users full management access
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.admin_users
    where (supabase_auth_id = (select auth.uid()) or lower(email) = lower((select auth.jwt()->>'email')))
      and active = true
  );
end;
$$ language plpgsql security definer;

-- Grants for Data API
grant select, update on public.admin_users to authenticated;
grant all on public.products, public.bonus_resources, public.customers, public.orders, public.order_items, public.payments, public.deliveries, public.refunds to authenticated;
grant select on public.audit_logs to authenticated;

-- Admin Read/Write Policies for Authenticated Admin Users
create policy "Admins can view their admin record" on public.admin_users for select to authenticated
  using (supabase_auth_id = (select auth.uid()) or lower(email) = lower((select auth.jwt()->>'email')));

create policy "Admins can update their admin record auth id" on public.admin_users for update to authenticated
  using (lower(email) = lower((select auth.jwt()->>'email')))
  with check (lower(email) = lower((select auth.jwt()->>'email')));

create policy "Admins can view products" on public.products for all to authenticated using (public.is_admin());
create policy "Admins can view bonus_resources" on public.bonus_resources for all to authenticated using (public.is_admin());
create policy "Admins can view customers" on public.customers for all to authenticated using (public.is_admin());
create policy "Admins can view orders" on public.orders for all to authenticated using (public.is_admin());
create policy "Admins can view order_items" on public.order_items for all to authenticated using (public.is_admin());
create policy "Admins can view payments" on public.payments for all to authenticated using (public.is_admin());
create policy "Admins can view deliveries" on public.deliveries for all to authenticated using (public.is_admin());
create policy "Admins can view refunds" on public.refunds for all to authenticated using (public.is_admin());
create policy "Admins can view audit_logs" on public.audit_logs for select to authenticated using (public.is_admin());

-- Auto-link Auth Trigger: Whenever an admin logs in via Supabase Auth (GitHub or Password),
-- link their auth.users id to the public.admin_users table automatically.
create or replace function public.handle_admin_auth_link()
returns trigger as $$
begin
  update public.admin_users
  set supabase_auth_id = new.id,
      updated_at = now()
  where lower(email) = lower(new.email)
    and (supabase_auth_id is null or supabase_auth_id <> new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_link_admin on auth.users;
create trigger on_auth_user_created_link_admin
  after insert or update on auth.users
  for each row execute function public.handle_admin_auth_link();

-- ----------------------------------------------------------------------------
-- 6. INITIAL CATALOGUE & ADMIN SEED DATA
-- ----------------------------------------------------------------------------
-- Pre-authorized Superadmin accounts
insert into public.admin_users (email, full_name, role, active)
values
  ('babatillu1520@gmail.com', 'Tillu (Owner)', 'superadmin', true),
  ('samarendranathpal46@gmail.com', 'Priyanshu Pal', 'superadmin', true)
on conflict (email) do update set
  role = 'superadmin',
  active = true,
  updated_at = now();

insert into public.products (slug, name, description, price_paise, display_order, active)
values
  ('physics', 'Physics', 'Complete 10-set bundle covering mechanics, electromagnetism, wave optics, modern physics, and high-probability examination derivations.', 15000, 1, true),
  ('bee', 'Basic Electrical Engineering', 'Complete 10-set bundle covering DC circuits, AC fundamentals, magnetic circuits, single-phase transformers, and DC machines.', 15000, 2, true),
  ('mathematics', 'Mathematics', 'Complete 10-set bundle covering linear algebra, multivariate calculus, differential equations, and complex analysis numerical problems.', 10000, 3, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_paise = excluded.price_paise,
  display_order = excluded.display_order,
  active = excluded.active,
  updated_at = now();

-- Initial Complementary Study Material Seed Data
insert into public.bonus_resources (title, description, drive_file_id, is_global, active)
values
  ('High-Yield Formula & Concept Compendium', 'Free bonus resource: Complete master formula sheet and important derivation quick-reference guide.', 'SAMPLE_BONUS_DRIVE_ID', true, true)
on conflict do nothing;

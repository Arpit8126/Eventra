-- ==========================================
-- EVENTRA DATABASE SCHEMA SETUP FOR SUPABASE
-- Run this script in your Supabase SQL Editor
-- ==========================================

-- 1. Enable UUID Extension if not already enabled
create extension if not exists "uuid-ossp";

-- 2. Create profiles table (links to auth.users)
create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    full_name text not null,
    email text not null unique,
    created_at timestamp with time zone default now()
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

-- 3. Create events table
create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    creator_id uuid not null references public.profiles(id) on delete cascade,
    internal_fund numeric not null default 0 check (internal_fund >= 0),
    created_at timestamp with time zone default now()
);

-- Enable RLS for events
alter table public.events enable row level security;

-- 4. Create event_members table
create table if not exists public.event_members (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    member_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default now(),
    unique (event_id, member_id)
);

-- Enable RLS for event_members
alter table public.event_members enable row level security;

-- 5. Create expenses table
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    added_by uuid not null references public.profiles(id) on delete cascade,
    amount numeric not null check (amount > 0),
    expense_date date not null default current_date,
    purpose text not null,
    is_updated boolean not null default false,
    created_at timestamp with time zone default now()
);

-- Enable RLS for expenses
alter table public.expenses enable row level security;

-- 6. Create income table (external funds)
create table if not exists public.income (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    added_by uuid not null references public.profiles(id) on delete cascade,
    amount numeric not null check (amount > 0),
    donor_name text not null,
    income_date date not null default current_date,
    is_updated boolean not null default false,
    created_at timestamp with time zone default now()
);

-- Enable RLS for income
alter table public.income enable row level security;

-- 7. Create logs table (immutable audit trail)
create table if not exists public.logs (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    action_type text not null, -- 'DELETE_EXPENSE', 'DELETE_INCOME', 'UPDATE_INTERNAL_FUND', 'UPDATE_EXPENSE', 'UPDATE_INCOME'
    performed_by uuid not null references public.profiles(id) on delete cascade,
    details jsonb not null,
    created_at timestamp with time zone default now()
);

-- Enable RLS for logs
alter table public.logs enable row level security;


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- --- Profiles Policies ---
create policy "Users can view all profiles"
    on public.profiles for select
    to authenticated
    using (true);

create policy "Users can update their own profile"
    on public.profiles for update
    to authenticated
    using (auth.uid() = id);

-- --- Events Policies ---
create policy "Users can view events they created or joined"
    on public.events for select
    to authenticated
    using (
        creator_id = auth.uid() or 
        id in (select event_id from public.event_members where member_id = auth.uid())
    );

create policy "Users can insert events"
    on public.events for insert
    to authenticated
    with check (creator_id = auth.uid());

create policy "Only creators can update events"
    on public.events for update
    to authenticated
    using (creator_id = auth.uid());

create policy "Only creators can delete events"
    on public.events for delete
    to authenticated
    using (creator_id = auth.uid());

-- --- Event Members Policies ---
create policy "Members can view event membership"
    on public.event_members for select
    to authenticated
    using (true);

create policy "Only creators can add members"
    on public.event_members for insert
    to authenticated
    with check (
        event_id in (select id from public.events where creator_id = auth.uid())
    );

create policy "Creators can remove members, or members can leave"
    on public.event_members for delete
    to authenticated
    using (
        event_id in (select id from public.events where creator_id = auth.uid()) or
        member_id = auth.uid()
    );

-- --- Expenses Policies ---
create policy "Members can view expenses"
    on public.expenses for select
    to authenticated
    using (
        event_id in (select id from public.events where creator_id = auth.uid()) or
        event_id in (select event_id from public.event_members where member_id = auth.uid())
    );

create policy "Members can add expenses"
    on public.expenses for insert
    to authenticated
    with check (
        added_by = auth.uid() and (
            event_id in (select id from public.events where creator_id = auth.uid()) or
            event_id in (select event_id from public.event_members where member_id = auth.uid())
        )
    );

create policy "Only record creators can update their expense"
    on public.expenses for update
    to authenticated
    using (added_by = auth.uid());

create policy "Only record creators can delete their expense"
    on public.expenses for delete
    to authenticated
    using (added_by = auth.uid());

-- --- Income Policies ---
create policy "Members can view income"
    on public.income for select
    to authenticated
    using (
        event_id in (select id from public.events where creator_id = auth.uid()) or
        event_id in (select event_id from public.event_members where member_id = auth.uid())
    );

create policy "Members can add income"
    on public.income for insert
    to authenticated
    with check (
        added_by = auth.uid() and (
            event_id in (select id from public.events where creator_id = auth.uid()) or
            event_id in (select event_id from public.event_members where member_id = auth.uid())
        )
    );

create policy "Only record creators can update their income"
    on public.income for update
    to authenticated
    using (added_by = auth.uid());

create policy "Only record creators can delete their income"
    on public.income for delete
    to authenticated
    using (added_by = auth.uid());

-- --- Logs Policies ---
create policy "Members can view event logs"
    on public.logs for select
    to authenticated
    using (
        event_id in (select id from public.events where creator_id = auth.uid()) or
        event_id in (select event_id from public.event_members where member_id = auth.uid())
    );


-- ==========================================
-- DATABASE TRIGGERS FOR LOGGING & SYNCING
-- ==========================================

-- 1. Sync User Profile from Auth.Users on creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, full_name, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        new.email
    );
    return new;
end;
$$ language plpgsql security definer;

-- Trigger to run handle_new_user
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- 2. Log Expense Deletion
create or replace function log_expense_deletion()
returns trigger as $$
begin
    insert into public.logs (event_id, action_type, performed_by, details)
    values (
        old.event_id,
        'DELETE_EXPENSE',
        auth.uid(),
        jsonb_build_object(
            'amount', old.amount,
            'expense_date', old.expense_date,
            'purpose', old.purpose,
            'added_by', old.added_by,
            'is_updated', old.is_updated,
            'created_at', old.created_at
        )
    );
    return old;
end;
$$ language plpgsql security definer;

-- Trigger for expense delete logging
drop trigger if exists on_expense_deleted on public.expenses;
create trigger on_expense_deleted
    after delete on public.expenses
    for each row execute procedure log_expense_deletion();

-- 3. Log Expense Update
create or replace function log_expense_update()
returns trigger as $$
begin
    insert into public.logs (event_id, action_type, performed_by, details)
    values (
        old.event_id,
        'UPDATE_EXPENSE',
        auth.uid(),
        jsonb_build_object(
            'previous_amount', old.amount,
            'previous_expense_date', old.expense_date,
            'previous_purpose', old.purpose,
            'new_amount', new.amount,
            'new_expense_date', new.expense_date,
            'new_purpose', new.purpose,
            'added_by', old.added_by,
            'created_at', old.created_at
        )
    );
    return new;
end;
$$ language plpgsql security definer;

-- Trigger for expense update logging
drop trigger if exists on_expense_updated on public.expenses;
create trigger on_expense_updated
    after update on public.expenses
    for each row execute procedure log_expense_update();

-- 4. Log Income Deletion
create or replace function log_income_deletion()
returns trigger as $$
begin
    insert into public.logs (event_id, action_type, performed_by, details)
    values (
        old.event_id,
        'DELETE_INCOME',
        auth.uid(),
        jsonb_build_object(
            'amount', old.amount,
            'income_date', old.income_date,
            'donor_name', old.donor_name,
            'added_by', old.added_by,
            'is_updated', old.is_updated,
            'created_at', old.created_at
        )
    );
    return old;
end;
$$ language plpgsql security definer;

-- Trigger for income delete logging
drop trigger if exists on_income_deleted on public.income;
create trigger on_income_deleted
    after delete on public.income
    for each row execute procedure log_income_deletion();

-- 5. Log Income Update
create or replace function log_income_update()
returns trigger as $$
begin
    insert into public.logs (event_id, action_type, performed_by, details)
    values (
        old.event_id,
        'UPDATE_INCOME',
        auth.uid(),
        jsonb_build_object(
            'previous_amount', old.amount,
            'previous_income_date', old.income_date,
            'previous_donor_name', old.donor_name,
            'new_amount', new.amount,
            'new_income_date', new.income_date,
            'new_donor_name', new.donor_name,
            'added_by', old.added_by,
            'created_at', old.created_at
        )
    );
    return new;
end;
$$ language plpgsql security definer;

-- Trigger for income update logging
drop trigger if exists on_income_updated on public.income;
create trigger on_income_updated
    after update on public.income
    for each row execute procedure log_income_update();

-- 6. Log Internal Fund Updates (on events table)
create or replace function log_internal_fund_update()
returns trigger as $$
begin
    if old.internal_fund <> new.internal_fund then
        insert into public.logs (event_id, action_type, performed_by, details)
        values (
            new.id,
            'UPDATE_INTERNAL_FUND',
            auth.uid(),
            jsonb_build_object(
                'previous_amount', old.internal_fund,
                'new_amount', new.internal_fund,
                'difference', (new.internal_fund - old.internal_fund)
            )
        );
    end if;
    return new;
end;
$$ language plpgsql security definer;

-- Trigger for internal fund update logging
drop trigger if exists on_internal_fund_updated on public.events;
create trigger on_internal_fund_updated
    after update on public.events
    for each row execute procedure log_internal_fund_update();


-- ==========================================
-- DATABASE RPC FUNCTIONS FOR MEMBERS SEARCH
-- ==========================================

-- Search verified users ignoring casing and spaces, excluding existing members/creator
create or replace function public.search_members(search_query text, current_event_id uuid)
returns table (
    id uuid,
    full_name text,
    email text
) as $$
begin
    return query
    select p.id, p.full_name, p.email
    from public.profiles p
    where 
        -- Search by full name or email (ignoring casing and spaces)
        (replace(lower(p.full_name), ' ', '') like '%' || replace(lower(search_query), ' ', '') || '%'
         or lower(p.email) like '%' || lower(search_query) || '%')
        -- Exclude users already in the event_members table
        and p.id not in (
            select em.member_id from public.event_members em where em.event_id = current_event_id
        )
        -- Exclude the event creator
        and p.id not in (
            select e.creator_id from public.events e where e.id = current_event_id
        );
end;
$$ language plpgsql security definer;

-- =======================================================
-- EVENTRA SCHEMA UPDATE: INTERNAL FUNDS AND NOTIFICATIONS
-- Run this script in your Supabase SQL Editor
-- =======================================================

-- 1. Create internal_funds table to track contributions per member
create table if not exists public.internal_funds (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    member_id uuid not null references public.profiles(id) on delete cascade,
    amount numeric not null check (amount > 0),
    added_by uuid not null references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default now()
);

-- Enable Row Level Security (RLS)
alter table public.internal_funds enable row level security;

-- Policies for internal_funds
drop policy if exists "Members can view internal funds" on public.internal_funds;
create policy "Members can view internal funds"
    on public.internal_funds for select
    to authenticated
    using (
        event_id in (select id from public.events where creator_id = auth.uid()) or
        event_id in (select event_id from public.event_members where member_id = auth.uid())
    );

drop policy if exists "Only event creators can insert internal funds" on public.internal_funds;
create policy "Only event creators can insert internal funds"
    on public.internal_funds for insert
    to authenticated
    with check (
        event_id in (select id from public.events where creator_id = auth.uid())
    );


-- 2. Create event_notifications table
create table if not exists public.event_notifications (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    member_id uuid not null references public.profiles(id) on delete cascade,
    message text not null,
    created_at timestamp with time zone default now()
);

-- Enable Row Level Security (RLS)
alter table public.event_notifications enable row level security;

-- Policies for event_notifications
drop policy if exists "Users can view their own event notifications, and creators can view all" on public.event_notifications;
create policy "Users can view their own event notifications, and creators can view all"
    on public.event_notifications for select
    to authenticated
    using (
        member_id = auth.uid() or
        event_id in (select id from public.events where creator_id = auth.uid())
    );


-- 3. Trigger function to update parent event internal_fund total automatically
create or replace function public.update_event_internal_fund_total()
returns trigger as $$
begin
    update public.events
    set internal_fund = internal_fund + new.amount
    where id = new.event_id;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_internal_fund_added on public.internal_funds;
create trigger on_internal_fund_added
    after insert on public.internal_funds
    for each row execute procedure public.update_event_internal_fund_total();


-- 4. Trigger function to generate automated personal notifications
create or replace function public.on_internal_fund_insert_trigger()
returns trigger as $$
declare
    admin_name text;
    earlier_fund numeric;
    new_fund numeric;
    contribution_count int;
begin
    -- Get the creator/admin's full name
    select full_name into admin_name from public.profiles where id = new.added_by;
    if admin_name is null or admin_name = '' then
        admin_name := 'Admin';
    end if;

    -- Count existing contributions for this member in this event (excluding the new one)
    select count(*) into contribution_count 
    from public.internal_funds 
    where event_id = new.event_id and member_id = new.member_id and id <> new.id;

    -- Calculate earlier fund
    select coalesce(sum(amount), 0) into earlier_fund 
    from public.internal_funds 
    where event_id = new.event_id and member_id = new.member_id and id <> new.id;

    new_fund := earlier_fund + new.amount;

    -- Generate notification message
    if contribution_count = 0 then
        -- First time contribution
        insert into public.event_notifications (event_id, member_id, message)
        values (
            new.event_id,
            new.member_id,
            '₹' || new.amount::text || ' is added by ' || admin_name || ' as your internal fund for first time'
        );
    else
        -- Second or subsequent contribution
        insert into public.event_notifications (event_id, member_id, message)
        values (
            new.event_id,
            new.member_id,
            'Your internal fund is increased by ' || admin_name || ' by ₹' || new.amount::text || '. Earlier: ₹' || earlier_fund::text || ', New: ₹' || new_fund::text
        );
    end if;

    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_internal_fund_inserted on public.internal_funds;
create trigger on_internal_fund_inserted
    after insert on public.internal_funds
    for each row execute procedure public.on_internal_fund_insert_trigger();

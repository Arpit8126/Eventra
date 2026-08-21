-- =======================================================
-- EVENTRA SCHEMA UPDATE: INCOME APPROVAL WORKFLOW
-- Run this script in your Supabase SQL Editor
-- =======================================================

-- 1. Add status and pending_update columns to public.income table
alter table public.income 
add column if not exists status text not null default 'Approved' 
check (status in ('Approved', 'Pending Approval', 'Pending Delete', 'Pending Update'));

alter table public.income 
add column if not exists pending_update jsonb default null;

-- 2. Add income reference columns to public.event_notifications table
alter table public.event_notifications
add column if not exists income_id uuid references public.income(id) on delete cascade;

alter table public.event_notifications
add column if not exists notification_type text not null default 'info';

alter table public.event_notifications
add column if not exists status text not null default 'pending';

-- 3. Update RLS policies for public.income
-- Enable event creators (admins) to update and delete member income records for their events
drop policy if exists "Only record creators can update their income" on public.income;
create policy "Only record creators and event creators can update income"
    on public.income for update
    to authenticated
    using (
        added_by = auth.uid() or
        event_id in (select id from public.events where creator_id = auth.uid())
    );

drop policy if exists "Only record creators can delete their income" on public.income;
create policy "Only record creators and event creators can delete income"
    on public.income for delete
    to authenticated
    using (
        added_by = auth.uid() or
        event_id in (select id from public.events where creator_id = auth.uid())
    );

-- 4. Enable RLS insert & delete policies for public.event_notifications
-- Allow users to insert and delete notifications for their events securely from client SDK
drop policy if exists "Users can insert event notifications" on public.event_notifications;
create policy "Users can insert event notifications"
    on public.event_notifications for insert
    to authenticated
    with check (
        member_id = auth.uid() or
        event_id in (select event_id from public.event_members where member_id = auth.uid()) or
        event_id in (select id from public.events where creator_id = auth.uid())
    );

drop policy if exists "Users can delete event notifications" on public.event_notifications;
create policy "Users can delete event notifications"
    on public.event_notifications for delete
    to authenticated
    using (
        member_id = auth.uid() or
        event_id in (select id from public.events where creator_id = auth.uid())
    );

-- ==========================================================
-- EVENTRA POLICY FIX: RUN THIS IN YOUR SUPABASE SQL EDITOR
-- ==========================================================

drop policy if exists "Users can insert event notifications" on public.event_notifications;
create policy "Users can insert event notifications"
    on public.event_notifications for insert
    to authenticated
    with check (
        member_id = auth.uid() or
        event_id in (select event_id from public.event_members where member_id = auth.uid()) or
        event_id in (select id from public.events where creator_id = auth.uid())
    );

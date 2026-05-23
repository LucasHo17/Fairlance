-- Migration: Setup Notification Retention and Pruning Policies
-- Target: prune old notifications to save database storage and maintain query performance.

-- 1. Create a secure pruning function that can be executed by background workers
create or replace function public.prune_old_notifications()
returns void
language plpgsql
security definer -- Runs as the creator (owner) bypassing standard RLS checks
set search_path = public
as $$
begin
    -- Delete notifications that have been read and are older than 30 days
    delete from public.notifications
    where is_read = true
      and created_at < now() - interval '30 days';

    -- Delete any notifications (even unread ones) older than 90 days as a safety fallback
    delete from public.notifications
    where created_at < now() - interval '90 days';

    -- Keep only the latest 100 notifications per user to prevent bloat
    delete from public.notifications
    where id in (
        select id
        from (
            select id, row_number() over (partition by user_id order by created_at desc) as rn
            from public.notifications
        ) t
        where t.rn > 100
    );
end;
$$;

-- 2. Enable pg_cron extension (standard on Supabase)
create extension if not exists pg_cron;

-- 3. Schedule the pruning function to run daily at midnight
select cron.schedule(
    'prune-notifications-daily',  -- Job name
    '0 0 * * *',                    -- Run every day at midnight (UTC)
    'select public.prune_old_notifications();'
);

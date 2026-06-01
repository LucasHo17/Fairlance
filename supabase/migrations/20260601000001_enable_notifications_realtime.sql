-- ============================================================
-- Enable Supabase Realtime on the notifications table so that
-- the frontend useNotifications hook receives live INSERT/UPDATE
-- events via postgres_changes subscriptions.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Migration: Secure Notifications RLS Policies
-- Target: Drop the public insert policy on the notifications table to ensure only the Service Role (the edge function) can write notifications.

-- Drop the overly permissive insert policy
drop policy if exists "Service role can insert notifications" on public.notifications;

-- Confirm RLS is fully locked down for insert
-- NOTE: Because RLS is enabled on public.notifications and there is no active INSERT policy,
-- public/anonymous/authenticated client roles can no longer write to this table.
-- The Deno Edge Function (using SUPABASE_SERVICE_ROLE_KEY) will continue to bypass RLS and perform insertions perfectly.

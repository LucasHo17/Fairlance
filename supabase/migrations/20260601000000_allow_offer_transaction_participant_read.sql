-- ============================================================
-- Migration: allow_offer_transaction_participant_read
-- Allows offer and transaction participants to read each other's
-- basic user profile (such as full_name) so that the UI can
-- display actual participant names.
-- ============================================================

CREATE POLICY "users_select_offer_participant"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.offers o
      WHERE
        (o.customer_id = auth.uid() AND o.freelancer_id = users.id)
        OR
        (o.freelancer_id = auth.uid() AND o.customer_id = users.id)
    )
  );

CREATE POLICY "users_select_transaction_participant"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE
        (t.customer_id = auth.uid() AND t.freelancer_id = users.id)
        OR
        (t.freelancer_id = auth.uid() AND t.customer_id = users.id)
    )
  );

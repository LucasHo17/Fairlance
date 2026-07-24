-- Atomically accepts or rejects an offer.
--
-- The previous Edge Function performed the offer update and transaction insert
-- as separate PostgREST requests. That left a race window and could persist an
-- active offer without a corresponding transaction. This function owns the
-- complete state transition so PostgreSQL commits or rolls it back as one unit.

CREATE OR REPLACE FUNCTION public.respond_to_offer(
  p_offer_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_transaction public.transactions%ROWTYPE;
  v_role text;
  v_other_user_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_offer_id IS NULL
     OR p_action IS NULL
     OR p_action NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'offer_id and action (accept|reject) are required'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize every response to this offer. A concurrent request waits here,
  -- then observes the state committed by the request that acquired the lock.
  SELECT *
  INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_offer.freelancer_id <> v_user_id
     AND v_offer.customer_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden: not a participant'
      USING ERRCODE = '42501';
  END IF;

  v_role := CASE
    WHEN v_offer.freelancer_id = v_user_id THEN 'freelancer'
    ELSE 'customer'
  END;

  -- Preserve support for local test data where one user is both participants.
  IF v_offer.freelancer_id = v_user_id
     AND v_offer.customer_id = v_user_id THEN
    v_role := CASE
      WHEN v_offer.proposed_by = 'freelancer' THEN 'customer'
      ELSE 'freelancer'
    END;
  END IF;

  IF v_offer.proposed_by = v_role THEN
    RAISE EXCEPTION 'Forbidden: cannot respond to your own proposal'
      USING ERRCODE = '42501';
  END IF;

  v_other_user_id := CASE
    WHEN v_role = 'freelancer' THEN v_offer.customer_id
    ELSE v_offer.freelancer_id
  END;

  -- A repeated accept after a successful response (or a lost response) returns
  -- the original transaction. This makes acceptance idempotent.
  IF v_offer.status = 'active' AND p_action = 'accept' THEN
    SELECT *
    INTO v_transaction
    FROM public.transactions
    WHERE offer_id = v_offer.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Offer is active but its transaction is missing'
        USING ERRCODE = '55000';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'active',
      'transaction', to_jsonb(v_transaction),
      'other_user_id', v_other_user_id,
      'idempotent', true
    );
  END IF;

  -- Repeating the same rejection is also safe.
  IF v_offer.status = 'rejected' AND p_action = 'reject' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected',
      'transaction', null,
      'other_user_id', v_other_user_id,
      'idempotent', true
    );
  END IF;

  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'Offer is already %', v_offer.status
      USING ERRCODE = '55000';
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.offers
    SET status = 'rejected'
    WHERE id = v_offer.id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected',
      'transaction', null,
      'other_user_id', v_other_user_id,
      'idempotent', false
    );
  END IF;

  UPDATE public.offers
  SET status = 'active'
  WHERE id = v_offer.id;

  INSERT INTO public.transactions (offer_id, final_price)
  VALUES (v_offer.id, v_offer.amount)
  RETURNING * INTO v_transaction;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'active',
    'transaction', to_jsonb(v_transaction),
    'other_user_id', v_other_user_id,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_offer(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_offer(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_offer(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.respond_to_offer(uuid, text) IS
  'Atomically accepts or rejects an offer with row locking and idempotent retries.';

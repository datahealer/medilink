-- Fix medical_histories column types: JSONB[] → TEXT[]
-- Idempotent: checks current column type before attempting conversion.

DO $$
BEGIN
  -- Only convert medications if it is still JSONB[]
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'medical_histories'
      AND column_name  = 'medications'
      AND udt_name     = '_jsonb'
  ) THEN
    CREATE OR REPLACE FUNCTION _tmp_jsonb_arr_to_text_arr(input jsonb[])
    RETURNS text[] LANGUAGE sql IMMUTABLE AS $func$
      SELECT ARRAY(
        SELECT CASE
          WHEN jsonb_typeof(el) = 'string' THEN el #>> '{}'
          WHEN jsonb_typeof(el) = 'object' THEN TRIM(COALESCE(el->>'name','') || ' ' || COALESCE(el->>'dosage',''))
          ELSE el::text
        END
        FROM unnest(input) AS el
      )
    $func$;

    ALTER TABLE public.medical_histories
      ALTER COLUMN medications TYPE TEXT[]
      USING _tmp_jsonb_arr_to_text_arr(medications);

    DROP FUNCTION IF EXISTS _tmp_jsonb_arr_to_text_arr(jsonb[]);
  END IF;

  -- Only convert surgeries if it is still JSONB[]
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'medical_histories'
      AND column_name  = 'surgeries'
      AND udt_name     = '_jsonb'
  ) THEN
    CREATE OR REPLACE FUNCTION _tmp_jsonb_arr_to_text_arr(input jsonb[])
    RETURNS text[] LANGUAGE sql IMMUTABLE AS $func$
      SELECT ARRAY(
        SELECT CASE
          WHEN jsonb_typeof(el) = 'string' THEN el #>> '{}'
          WHEN jsonb_typeof(el) = 'object' THEN COALESCE(el->>'name', el::text)
          ELSE el::text
        END
        FROM unnest(input) AS el
      )
    $func$;

    ALTER TABLE public.medical_histories
      ALTER COLUMN surgeries TYPE TEXT[]
      USING _tmp_jsonb_arr_to_text_arr(surgeries);

    DROP FUNCTION IF EXISTS _tmp_jsonb_arr_to_text_arr(jsonb[]);
  END IF;
END $$;

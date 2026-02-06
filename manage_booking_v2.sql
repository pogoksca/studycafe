-- [NEW] manage_booking_v2 (Fixed Cleanup)
-- Supports per-session study content via JSONB p_study_contents
-- Fixes issue where study plans for removed sessions (in update) were not deleted.

CREATE OR REPLACE FUNCTION public.manage_booking_v2(
    p_user_id UUID,
    p_student_id UUID,
    p_date DATE,
    p_session_ids INTEGER[],
    p_seat_id UUID,
    p_study_contents JSONB,
    p_old_booking_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id INTEGER;
    v_content TEXT;
BEGIN
    -- 1. Cleanup old bookings AND their associated study plans if this is an update/edit
    IF p_old_booking_ids IS NOT NULL AND array_length(p_old_booking_ids, 1) > 0 THEN
        
        -- 1a. Delete study plans corresponding to the bookings being removed
        -- Since study_plans table does not link to booking_id, we find matching (student, date, session) tuples.
        DELETE FROM public.study_plans
        WHERE (student_id, date, session_id) IN (
            SELECT student_id, date, session_id
            FROM public.bookings
            WHERE id = ANY(p_old_booking_ids)
        );

        -- 1b. Delete the bookings themselves
        DELETE FROM public.bookings WHERE id = ANY(p_old_booking_ids);
    END IF;

    -- 2. Cleanup existing study plans for the NEW targeted date and sessions
    -- This ensures we don't have conflicts when inserting new plans
    DELETE FROM public.study_plans 
    WHERE student_id = p_student_id 
      AND date = p_date 
      AND session_id = ANY(p_session_ids);

    -- 3. Insert new records for each session
    FOR i IN 1..array_length(p_session_ids, 1) LOOP
        v_session_id := p_session_ids[i];
        
        -- Extract content for this session from JSONB
        -- JSONB keys are strings, so cast integer session_id to text
        v_content := p_study_contents ->> v_session_id::TEXT;
        
        -- Default to empty string if NULL
        IF v_content IS NULL THEN
            v_content := '';
        END IF;

        -- Booking insert
        INSERT INTO public.bookings (user_id, student_id, seat_id, date, session_id, booking_type)
        VALUES (p_user_id, p_student_id, p_seat_id, p_date, v_session_id, 'regular');
        
        -- Study plan insert
        INSERT INTO public.study_plans (user_id, student_id, date, session_id, content)
        VALUES (p_user_id, p_student_id, p_date, v_session_id, v_content);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_booking_v2 TO anon, authenticated;

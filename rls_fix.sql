-- [CORRECTED FINAL SECURE SOLUTION]
-- Removed 'status' column from public.bookings as it does not exist in the schema.

CREATE OR REPLACE FUNCTION public.manage_booking_v1(
    p_user_id UUID,
    p_student_id UUID,
    p_date DATE,
    p_session_ids INTEGER[],
    p_seat_id UUID,
    p_study_content TEXT,
    p_old_booking_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Cleanup old bookings if this is an update/edit
    IF p_old_booking_ids IS NOT NULL AND array_length(p_old_booking_ids, 1) > 0 THEN
        DELETE FROM public.bookings WHERE id = ANY(p_old_booking_ids);
    END IF;

    -- 2. Cleanup existing study plans for the targeted date and sessions
    DELETE FROM public.study_plans 
    WHERE student_id = p_student_id 
      AND date = p_date 
      AND session_id = ANY(p_session_ids);

    -- 3. Insert new records for each session
    FOR i IN 1..array_length(p_session_ids, 1) LOOP
        -- Booking insert (Removed 'status' column)
        INSERT INTO public.bookings (user_id, student_id, seat_id, date, session_id, booking_type)
        VALUES (p_user_id, p_student_id, p_seat_id, p_date, p_session_ids[i], 'regular');
        
        -- Study plan insert
        INSERT INTO public.study_plans (user_id, student_id, date, session_id, content)
        VALUES (p_user_id, p_student_id, p_date, p_session_ids[i], p_study_content);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_booking_v1 TO anon, authenticated;

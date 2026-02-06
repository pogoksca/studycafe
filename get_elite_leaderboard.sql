-- [NEW] get_elite_leaderboard
-- Calculates ranking based on cumulative study time and days
-- Returns top 10 students

-- 1. Robust Cleanup: Drop ALL functions with this name regardless of arguments
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN 
        SELECT oid::regprocedure as p_name 
        FROM pg_proc 
        WHERE proname = 'get_elite_leaderboard' 
        AND pronamespace = 'public'::regnamespace 
    LOOP 
        EXECUTE 'DROP FUNCTION ' || r.p_name; 
    END LOOP; 
END $$;

-- 2. Create the function
CREATE OR REPLACE FUNCTION public.get_elite_leaderboard(
    start_date DATE,
    end_date DATE
)
RETURNS TABLE (
    rank BIGINT,
    student_id UUID,
    student_name TEXT,
    grade INTEGER,
    total_time_minutes NUMERIC,
    total_days BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH bookings_expanded AS (
        SELECT 
            b.student_id,
            b.date,
            a.status,
            -- Calculate session wall times in absolute timestamptz (Asia/Seoul)
            (b.date + s.start_time)::timestamp AT TIME ZONE 'Asia/Seoul' as session_start_tz,
            (b.date + s.end_time)::timestamp AT TIME ZONE 'Asia/Seoul' as session_end_tz,
            a.timestamp_in,
            a.timestamp_out
        FROM public.bookings b
        JOIN public.sessions s ON b.session_id = s.id
        LEFT JOIN public.attendance a ON a.booking_id = b.id
        WHERE b.date >= start_date 
          AND b.date <= end_date
    ),
    study_stats AS (
        SELECT 
            be.student_id,
            -- Count days with valid attendance status
            COUNT(DISTINCT CASE 
                WHEN be.status IN ('present', 'late', 'early_leave') THEN be.date 
                ELSE NULL 
            END) as days_count,
            -- Sum minutes precisely
            SUM(
                CASE 
                    WHEN be.status IN ('present', 'late', 'early_leave') THEN
                        GREATEST(0, EXTRACT(EPOCH FROM (
                            -- Effective End: Min of (SessionEnd, ActualOut)
                            -- Fallback: If ActualOut is NULL, assume SessionEnd
                            LEAST(
                                COALESCE(be.timestamp_out, be.session_end_tz), 
                                be.session_end_tz
                            ) 
                            - 
                            -- Effective Start: Max of (SessionStart, ActualIn)
                            -- Fallback: If ActualIn is NULL, assume SessionStart
                            GREATEST(
                                COALESCE(be.timestamp_in, be.session_start_tz), 
                                be.session_start_tz
                            )
                        )) / 60)
                    ELSE 0 
                END
            ) as total_minutes
        FROM bookings_expanded be
        GROUP BY be.student_id
    ),
    ranked_students AS (
        SELECT 
            ss.student_id,
            p.full_name,
            p.grade,
            COALESCE(ss.total_minutes, 0) as stats_time,
            COALESCE(ss.days_count, 0) as stats_days,
            RANK() OVER (ORDER BY ss.total_minutes DESC, ss.days_count DESC) as rk
        FROM study_stats ss
        JOIN public.profiles_student p ON ss.student_id = p.id
    )
    SELECT 
        rs.rk as rank,
        rs.student_id,
        rs.full_name,
        rs.grade,
        -- Round to 1 decimal place for precision display if needed, or integer
        ROUND(rs.stats_time, 0) as total_time_minutes,
        rs.stats_days
    FROM ranked_students rs
    WHERE rs.rk <= 10
    ORDER BY rs.rk ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_elite_leaderboard TO anon, authenticated;

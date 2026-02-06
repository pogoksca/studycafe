-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.applicant_pool (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  student_id text NOT NULL,
  phone_number text,
  role text DEFAULT 'student'::text CHECK (role = ANY (ARRAY['student'::text, 'parent'::text, 'teacher'::text, 'admin'::text, 'applicant'::text])),
  status text DEFAULT 'applied'::text CHECK (status = ANY (ARRAY['applied'::text, 'pending'::text, 'approved'::text, 'rejected'::text])),
  pledge_accepted boolean DEFAULT false,
  privacy_accepted boolean DEFAULT false,
  pledged_at timestamp with time zone,
  rejection_reason text,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  student_signature text,
  parent_signature text,
  CONSTRAINT applicant_pool_pkey PRIMARY KEY (id),
  CONSTRAINT applicant_pool_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_id uuid UNIQUE,
  status text DEFAULT 'absent'::text CHECK (status = ANY (ARRAY['present'::text, 'late'::text, 'absent'::text, 'early_leave'::text])),
  timestamp_in timestamp with time zone,
  timestamp_out timestamp with time zone,
  late_reason text,
  early_leave_reason text,
  is_excused boolean DEFAULT false,
  excused_reason text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id)
);
CREATE TABLE public.bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  seat_id uuid,
  date date NOT NULL,
  session_id integer,
  booking_type text CHECK (booking_type = ANY (ARRAY['regular'::text, 'irregular'::text])),
  created_at timestamp with time zone DEFAULT now(),
  student_id uuid,
  CONSTRAINT bookings_pkey PRIMARY KEY (id),
  CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT bookings_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.seats(id),
  CONSTRAINT bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT bookings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles_student(id)
);
CREATE TABLE public.configs (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT configs_pkey PRIMARY KEY (key)
);
CREATE TABLE public.operation_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  exception_date date NOT NULL,
  reason text,
  is_closed boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  zone_id bigint DEFAULT 1,
  CONSTRAINT operation_exceptions_pkey PRIMARY KEY (id),
  CONSTRAINT operation_exceptions_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id)
);
CREATE TABLE public.operation_quarters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quarter integer,
  start_date date,
  end_date date,
  quarter_name text,
  academic_year integer DEFAULT 2026,
  CONSTRAINT operation_quarters_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['student'::text, 'teacher'::text, 'admin'::text, 'parent'::text, 'applicant'::text])),
  grade integer,
  class_number integer,
  student_number integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles_student (
  id uuid NOT NULL,
  username text UNIQUE,
  full_name text,
  grade integer,
  class_number integer,
  student_number integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'approved'::text,
  CONSTRAINT profiles_student_pkey PRIMARY KEY (id)
);
CREATE TABLE public.seats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quarter_id uuid,
  seat_number text NOT NULL,
  zone_name text DEFAULT 'A'::text,
  pos_x double precision DEFAULT 0,
  pos_y double precision DEFAULT 0,
  rotation double precision DEFAULT 0,
  seat_type text DEFAULT 'closed'::text CHECK (seat_type = ANY (ARRAY['closed'::text, 'open'::text, 'sofa'::text])),
  grade_limit integer,
  created_at timestamp with time zone DEFAULT now(),
  display_number text,
  global_number integer,
  zone_color text DEFAULT '#5E5CE6'::text,
  type text DEFAULT 'seat'::text,
  width integer DEFAULT 72,
  height integer DEFAULT 72,
  label text,
  zone_id integer,
  bg_color text DEFAULT '#E5E5EA'::text,
  stroke_color text DEFAULT '#D1D1D6'::text,
  text_color text DEFAULT '#8E8E93'::text,
  font_size integer DEFAULT 12,
  CONSTRAINT seats_pkey PRIMARY KEY (id),
  CONSTRAINT seats_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id)
);
CREATE TABLE public.session_operating_days (
  id integer NOT NULL DEFAULT nextval('session_operating_days_id_seq'::regclass),
  session_id integer,
  day_of_week integer CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_active boolean DEFAULT true,
  CONSTRAINT session_operating_days_pkey PRIMARY KEY (id),
  CONSTRAINT session_operating_days_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.sessions (
  id integer NOT NULL DEFAULT nextval('sessions_id_seq'::regclass),
  name text NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  zone_id integer,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id)
);
CREATE TABLE public.study_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  date date NOT NULL,
  session_id integer,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  student_id uuid,
  CONSTRAINT study_plans_pkey PRIMARY KEY (id),
  CONSTRAINT study_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT study_plans_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT study_plans_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles_student(id)
);
CREATE TABLE public.supervision_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  supervisor_name text NOT NULL,
  teacher_id uuid,
  signature_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  zone_id integer,
  session_id integer,
  CONSTRAINT supervision_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT supervision_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT supervision_assignments_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id),
  CONSTRAINT supervision_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.zones (
  id integer NOT NULL DEFAULT nextval('zones_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  description text,
  settings jsonb DEFAULT '{"radius": 100, "instant_booking": false, "qr_code_required": false}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT zones_pkey PRIMARY KEY (id)
);
-- StudyCafe (Cheongramjae) Project Schema

-- 1. Profiles Table (Extends auth.users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL, -- Student ID or Staff ID
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    grade INTEGER,
    class_number INTEGER,
    student_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Quarters Table
CREATE TABLE quarters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL, -- e.g., '2026-1Q'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions (Time Slots) Table
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL, -- Morning, Dinner, 1st, 2nd
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    operational_days INTEGER[] -- Array of days (1=Mon, 5=Fri). e.g., {1,2,3,4,5}
);

-- Initial Sessions Data
INSERT INTO sessions (name, start_time, end_time, operational_days) VALUES
('Morning', '08:00', '08:50', '{1,2,3,4,5}'),
('Dinner', '17:00', '18:00', '{1,2,3,4}'),
('1st Period', '18:00', '19:20', '{1,2,3,4}'),
('2nd Period', '19:30', '21:00', '{1,2,3,4}');

-- 4. Seats Table (Physical & Logical Layout)
CREATE TABLE seats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quarter_id UUID REFERENCES quarters ON DELETE CASCADE,
    seat_number TEXT NOT NULL, -- Logical local number (e.g., '1')
    display_number TEXT,        -- Zone-prefixed number (e.g., 'A-01')
    global_number INTEGER,      -- Continuous unique sequence (1-106)
    zone_name TEXT DEFAULT 'A', -- Zone identifier (A, B, C)
    zone_color TEXT DEFAULT '#5E5CE6',
    pos_x FLOAT DEFAULT 0,
    pos_y FLOAT DEFAULT 0,
    rotation FLOAT DEFAULT 0,
    seat_type TEXT DEFAULT 'closed' CHECK (seat_type IN ('closed', 'open', 'sofa')),
    grade_limit INTEGER, -- Grade allowed to sit here
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bookings Table
CREATE TABLE bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles ON DELETE CASCADE,
    seat_id UUID REFERENCES seats ON DELETE CASCADE,
    date DATE NOT NULL,
    session_id INTEGER REFERENCES sessions,
    booking_type TEXT CHECK (booking_type IN ('regular', 'irregular')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date, session_id), -- Student can't book twice for the same time
    UNIQUE(seat_id, date, session_id)  -- Seat can't be booked twice for the same time
);

-- 6. Attendance Table
CREATE TABLE attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id UUID REFERENCES bookings ON DELETE CASCADE UNIQUE,
    status TEXT DEFAULT 'absent' CHECK (status IN ('present', 'late', 'absent', 'early_leave')),
    timestamp_in TIMESTAMPTZ,
    timestamp_out TIMESTAMPTZ,
    late_reason TEXT,
    early_leave_reason TEXT,
    is_excused BOOLEAN DEFAULT false, -- If homeroom teacher authorized
    excused_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Pre-Authorizations (Excused Absence by Homeroom Teacher)
CREATE TABLE pre_authorizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES profiles ON DELETE CASCADE,
    date DATE NOT NULL,
    reason TEXT,
    authorized_by UUID REFERENCES profiles, -- Teacher ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Safety Supervision Assignments (Teacher Duty)
CREATE TABLE supervision_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    staff_id_1 UUID REFERENCES profiles,
    staff_id_2 UUID REFERENCES profiles,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date)
);

-- 9. Study Plans Table
CREATE TABLE study_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles ON DELETE CASCADE,
    date DATE NOT NULL,
    session_id INTEGER REFERENCES sessions,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Operational Calendar (Holidays/Events)
CREATE TABLE blackout_dates (
    date DATE PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. App Configurations (Settings)
CREATE TABLE configs (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial Config Example: GPS Reference Point
INSERT INTO configs (key, value) VALUES ('gps_settings', '{"lat": 37.5, "lng": 127.0, "radius": 100}');

-- RLS (Row Level Security) - Simplified for start
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Basic Policies (To be refined later)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 9. Configs Table (System Settings)
CREATE TABLE configs (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial GPS settings
INSERT INTO configs (key, value)
VALUES ('gps_settings', '{"lat": 37.5665, "lng": 126.9780, "radius": 100}')
ON CONFLICT (key) DO NOTHING;

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kglshjhuofkouiodmkgs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbHNoamh1b2Zrb3Vpb2Rta2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDE3ODgsImV4cCI6MjA4NTAxNzc4OH0.kqoUY-stIdwOw3vtpowcbzV_AvjgGtzXN6i9bjQCW-Y';

const supabase = createClient(supabaseUrl, supabaseKey);

const checkSchema = async () => {
    console.log('--- Profiles ---');
    const { data: p } = await supabase.from('profiles').select('*').limit(1);
    console.log(Object.keys(p?.[0] || {}));

    console.log('--- Profiles Student ---');
    const { data: ps } = await supabase.from('profiles_student').select('*').limit(1);
    console.log(Object.keys(ps?.[0] || {}));

    console.log('--- Bookings ---');
    const { data: b } = await supabase.from('bookings').select('*').limit(1);
    console.log(Object.keys(b?.[0] || {}));
};

checkSchema();

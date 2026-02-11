const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kglshjhuofkouiodmkgs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbHNoamh1b2Zrb3Vpb2Rta2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDE3ODgsImV4cCI6MjA4NTAxNzc4OH0.kqoUY-stIdwOw3vtpowcbzV_AvjgGtzXN6i9bjQCW-Y';

const supabase = createClient(supabaseUrl, supabaseKey);

const listAllColumns = async () => {
    const { data, error } = await supabase.rpc('get_table_columns_v2'); // If available
    
    if (error) {
        // Fallback: try querying information_schema via a custom function if it exists
        // Or just guess some tables
        const tables = ['profiles', 'profiles_student', 'bookings', 'attendance', 'parent_students', 'parent_child_map'];
        for (const t of tables) {
            const { data: cols, error: e } = await supabase.from(t).select('*').limit(0);
            if (!e) {
                console.log(`Table: ${t}`);
                // In some cases we can get column names from header or similar, but with JS client it's hard without data.
                // Let's try to get 1 row again but specifically looking for ALL possible keys.
                const { data: row } = await supabase.from(t).select('*').limit(1);
                if (row && row.length > 0) {
                    console.log(Object.keys(row[0]));
                }
            }
        }
    } else {
        console.log(data);
    }
};

listAllColumns();

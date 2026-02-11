const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kglshjhuofkouiodmkgs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbHNoamh1b2Zrb3Vpb2Rta2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDE3ODgsImV4cCI6MjA4NTAxNzc4OH0.kqoUY-stIdwOw3vtpowcbzV_AvjgGtzXN6i9bjQCW-Y';

const supabase = createClient(supabaseUrl, supabaseKey);

const findUniqueStatuses = async () => {
    const { data, error } = await supabase
        .from('attendance')
        .select('status');
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    const statuses = [...new Set(data.map(item => item.status))];
    console.log('Unique Statuses In Database:', statuses);
};

findUniqueStatuses();

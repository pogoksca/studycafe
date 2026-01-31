import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    Calendar as CalendarIcon, 
    ChevronLeft, 
    ChevronRight, 
    Plus, 
    Trash2, 
    Save, 
    AlertCircle, 
    Clock, 
    Sun, 
    Moon, 
    Coffee, 
    BookOpen 
} from 'lucide-react';
import { 
    format, 
    addMonths, 
    subMonths, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    isSameMonth, 
    isSameDay, 
    addDays, 
    eachDayOfInterval, 
    isWithinInterval,
    parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';

const OperationManager = () => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [zones, setZones] = useState([]);
    const [selectedZoneId, setSelectedZoneId] = useState(null);
    const [quarters, setQuarters] = useState([]);
    const [defaults, setDefaults] = useState([]);
    const [exceptions, setExceptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingQuarters, setSavingQuarters] = useState(false);
    const [savingDefaults, setSavingDefaults] = useState(false);

    const [newException, setNewException] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        reason: '',
        is_closed: true
    });

    const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        const { data } = await supabase.from('zones').select('*').eq('is_active', true).order('created_at', { ascending: true });
        if (data && data.length > 0) {
            setZones(data);
            setSelectedZoneId(data[0].id);
        }
    };

    useEffect(() => {
        if (selectedZoneId) {
            fetchData(academicYear, selectedZoneId);
        }
    }, [academicYear, selectedZoneId]);

    const fetchData = async (year, zoneId) => {
        setLoading(true);
        const [qData, dData, eData] = await Promise.all([
            supabase.from('operation_quarters')
                .select('*')
                .eq('academic_year', year)
                .order('quarter', { ascending: true }),
            supabase.from('operation_defaults')
                .select('*')
                .eq('zone_id', zoneId)
                .order('day_of_week', { ascending: true }),
            supabase.from('operation_exceptions')
                .select('*')
                .eq('zone_id', zoneId)
                .order('exception_date', { ascending: true })
        ]);

        const existingQuarters = qData.data || [];
        const minQuarters = [1, 2, 3, 4];
        const merged = minQuarters.map(qNum => {
            const found = existingQuarters.find(q => q.quarter === qNum);
            return found || { quarter: qNum, start_date: null, end_date: null, academic_year: year };
        });
        const extraQuarters = existingQuarters.filter(q => q.quarter > 4);
        setQuarters([...merged, ...extraQuarters].sort((a, b) => a.quarter - b.quarter));

        if (dData.data && dData.data.length > 0) {
            setDefaults(dData.data);
        } else {
            setDefaults([0, 1, 2, 3, 4, 5, 6].map(d => ({
                zone_id: zoneId,
                day_of_week: d,
                morning: false,
                dinner: false,
                period1: false,
                period2: false
            })));
        }

        if (eData.data) setExceptions(eData.data);
        setLoading(false);
    };

    const handleYearChange = () => {
        setAcademicYear(selectedYear);
    };

    const handleQuarterUpdateLocal = (quarterNum, field, value) => {
        const updated = quarters.map(q => 
            q.quarter === quarterNum ? { ...q, [field]: value } : q
        );
        setQuarters(updated);
    };

    const saveQuarters = async () => {
        setSavingQuarters(true);
        // Map empty strings to null to avoid Postgres DATE format error
        const quartersToSave = quarters
            .filter(q => q.start_date || q.end_date) // Only save if at least one date is set
            .map(({ id, quarter, start_date, end_date, quarter_name }) => ({
                quarter,
                start_date: start_date || null,
                end_date: end_date || null,
                quarter_name: quarter_name || `${quarter}분기`, // Auto-generate name if empty
                academic_year: academicYear
            }));

        // We need to handle potential conflicts carefully. 
        // Upsert needs to match the UNIQUE constraint (academic_year, quarter)
        const { error } = await supabase
            .from('operation_quarters')
            .upsert(quartersToSave, { onConflict: 'academic_year, quarter' });
        
        if (error) {
            alert('분기 기간 저장 중 오류가 발생했습니다: ' + error.message);
        } else {
            alert('분기 운영 기간이 저장되었습니다.');
            fetchData(academicYear);
        }
        setSavingQuarters(false);
    };

    const handleDeleteQuarter = async (qNum) => {
        const quarter = quarters.find(q => q.quarter === qNum);
        if (!quarter) return;

        // Check for existing bookings if dates were set
        if (quarter.start_date && quarter.end_date) {
            const { count, error: countError } = await supabase
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .gte('date', quarter.start_date)
                .lte('date', quarter.end_date);
            
            if (countError) {
                console.error('Error checking bookings:', countError);
            } else if (count > 0) {
                if (!window.confirm(`해당 기간(${quarter.start_date} ~ ${quarter.end_date})에 이미 ${count}건의 예약이 존재합니다. 그래도 분기 설정을 삭제하시겠습니까?\n(예약 데이터 자체는 삭제되지 않으나, 학생들의 신규 예약이 불가능해집니다.)`)) {
                    return;
                }
            } else {
                if (!window.confirm(`${qNum}분기 운영 기간을 삭제하시겠습니까?`)) return;
            }
        } else {
            if (!window.confirm(`${qNum}분기 항목을 삭제하시겠습니까?`)) return;
        }

        try {
            // Delete from database
            const { error } = await supabase
                .from('operation_quarters')
                .delete()
                .eq('academic_year', academicYear)
                .eq('quarter', qNum);

            if (error) throw error;

            // Update local state
            if (qNum <= 4) {
                // For standard quarters, just clear the dates
                setQuarters(prev => prev.map(q => 
                    q.quarter === qNum ? { ...q, start_date: null, end_date: null, quarter_name: null } : q
                ));
            } else {
                // For extra quarters, remove from state
                setQuarters(prev => prev.filter(q => q.quarter !== qNum));
            }
            
            alert(`${qNum}분기 운영 기간이 삭제되었습니다.`);
        } catch (err) {
            console.error('Error deleting quarter:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const handleAddQuarter = () => {
        const maxQuarter = quarters.length > 0 ? Math.max(...quarters.map(q => q.quarter)) : 0;
        setQuarters([...quarters, { quarter: maxQuarter + 1, start_date: null, end_date: null, academic_year: academicYear }]);
    };

    const handleDefaultToggleLocal = (dayNum, period) => {
        const updated = defaults.map(d => 
            d.day_of_week === dayNum ? { ...d, [period]: !d[period] } : d
        );
        setDefaults(updated);
    };

    const saveDefaults = async () => {
        setSavingDefaults(true);
        const { error } = await supabase
            .from('operation_defaults')
            .upsert(defaults, { onConflict: 'day_of_week' });
        
        if (error) {
            alert('기본 운영 요일 저장 중 오류가 발생했습니다.');
        } else {
            alert('기본 운영 요일 설정이 저장되었습니다.');
            fetchData(academicYear);
        }
        setSavingDefaults(false);
    };


    const handleAddException = async (e) => {
        e.preventDefault();
        if (!selectedZoneId) return;
        
        const { error } = await supabase
            .from('operation_exceptions')
            .insert([{ 
                exception_date: newException.date, 
                reason: newException.reason, 
                is_closed: true,
                zone_id: selectedZoneId
            }]);

        if (!error) {
            setNewException({ ...newException, reason: '' });
            fetchData(academicYear, selectedZoneId);
        }
    };

    const handleDeleteException = async (id) => {
        await supabase.from('operation_exceptions').delete().eq('id', id);
        fetchData(academicYear);
    };

    // Calendar Rendering
    const renderHeader = () => (
        <div className="flex items-center justify-between mb-6 px-2">
            <div className="flex items-center gap-6">
                <div>
                    <h3 className="text-xl font-black text-[#1C1C1E] tracking-tight">
                        {format(currentMonth, 'yyyy년 MMMM', { locale: ko })}
                    </h3>
                    <p className="text-[10px] font-black text-ios-indigo uppercase tracking-widest mt-1">Operating Calendar</p>
                </div>

                {/* Zone Selection */}
                <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    {zones.map(z => (
                        <button
                            key={z.id}
                            onClick={() => setSelectedZoneId(z.id)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ios-tap ${
                                selectedZoneId === z.id ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-ios-gray hover:text-[#1C1C1E]'
                            }`}
                        >
                            {z.name}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                    <ChevronLeft className="w-5 h-5 text-ios-gray" />
                </button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                    <ChevronRight className="w-5 h-5 text-ios-gray" />
                </button>
            </div>
        </div>
    );

    const renderDays = () => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return (
            <div className="grid grid-cols-7 mb-2 border-b border-gray-100">
                {days.map((day, i) => (
                    <div key={i} className={`py-3 text-[10px] font-black uppercase text-center tracking-widest ${i === 0 ? 'text-ios-rose' : i === 6 ? 'text-ios-indigo' : 'text-ios-gray'}`}>
                        {day}
                    </div>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-[12px] overflow-hidden shadow-sm">
                {calendarDays.map((date, i) => {
                    const isToday = isSameDay(date, new Date());
                    const isSameMonthDate = isSameMonth(date, monthStart);
                    const dayOfWeek = date.getDay();
                    const dateStr = format(date, 'yyyy-MM-dd');
                    
                    const exception = exceptions.find(e => e.exception_date === dateStr);
                    // Filter quarters by CURRENT selected academic year for display logic? 
                    // Actually, the calendar should ideally reflect the academic year of the date being viewed.
                    // But for now, we assume standard quarters. 
                    // To simplify, we check within the currently loaded quarters (which are for the selected academic year).
                    // User might want to see calendar for 2027 while 2026 is selected. 
                    // Ideally, we should fetch All quarters or fetch based on calendar view.
                    // However, for this specific request "Operating Management Page", let's use the loaded quarters.
                    const quarter = quarters.find(q => 
                        q.start_date && q.end_date && 
                        isWithinInterval(date, { 
                            start: parseISO(q.start_date), 
                            end: parseISO(q.end_date) 
                        })
                    );
                    
                    const dayDefault = defaults.find(d => d.day_of_week === dayOfWeek);
                    const isOperatingDay = quarter && !exception && (dayDefault?.morning || dayDefault?.dinner || dayDefault?.period1 || dayDefault?.period2);

                    return (
                        <div key={i} className={`min-h-[100px] p-2 flex flex-col gap-1 transition-colors border-b border-r border-gray-100 ${
                            !isSameMonthDate ? 'opacity-30 bg-gray-50' : 
                            exception ? 'bg-red-50/30' :
                            (isOperatingDay) ? 'bg-[#f0f9ff]' : 'bg-white'
                        }`}>
                            <div className="flex justify-between items-start">
                                <span className={`text-[11px] font-black ${isToday ? 'w-6 h-6 text-ios-indigo border-2 border-ios-indigo rounded-full flex items-center justify-center -mt-1 -ml-1 bg-white' : dayOfWeek === 0 ? 'text-ios-rose' : dayOfWeek === 6 ? 'text-ios-indigo' : 'text-[#1C1C1E]'}`}>
                                    {format(date, 'd')}
                                </span>
                                {quarter && (
                                    <span className="text-[8px] font-black bg-white/50 text-ios-indigo px-1.5 py-0.5 rounded-full uppercase tracking-tighter border border-ios-indigo/10">
                                        Q{quarter.quarter}
                                    </span>
                                )}
                            </div>
                            
                            {exception ? (
                                <div className="mt-1 flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">CLOSED</span>
                                    <span className="text-[9px] font-bold text-ios-gray leading-tight">{exception.reason}</span>
                                </div>
                            ) : isOperatingDay ? (
                                <div className="mt-1 flex flex-col gap-0.5">
                                    {[
                                        { label: '오전', key: 'morning' },
                                        { label: '석식', key: 'dinner' },
                                        { label: '1차', key: 'period1' },
                                        { label: '2차', key: 'period2' }
                                    ].map(p => (
                                        <div key={p.key} className="flex justify-between items-center bg-white/40 rounded-[2px] px-1 py-0.5">
                                            <span className="text-[8px] font-bold text-ios-gray">{p.label}</span>
                                            <span className={`text-[8px] font-black uppercase tracking-wider ${dayDefault[p.key] ? 'text-ios-indigo' : 'text-red-600'}`}>
                                                {dayDefault[p.key] ? 'OPEN' : 'CLOSED'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        );
    };

    if (loading) return (
        <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-indigo"></div>
        </div>
    );

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
            {/* Left: Calendar View */}
            <div className="flex-1 bg-white rounded-[6px] border border-gray-100 flex flex-col p-6 shadow-sm overflow-y-auto scrollbar-hide">
                {renderHeader()}
                {renderDays()}
                {renderCells()}
            </div>

            {/* Right: Settings Control */}
            <div className="lg:w-96 flex flex-col gap-6 overflow-y-auto scrollbar-hide pb-6">

                {/* 1. Academic Year & Quarter Dates */}
                <div className="bg-white rounded-[6px] border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-ios-indigo" />
                            <h4 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">분기별 운영 기간</h4>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={saveQuarters}
                                disabled={savingQuarters}
                                className="bg-[#1C1C1E] text-white px-5 py-2.5 rounded-[8px] text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-gray-800 shadow-md transition-all active:scale-95"
                            >
                                <Save className="w-3.5 h-3.5" /> 저장하기
                            </button>
                        </div>
                    </div>

                    {/* Academic Year Selection */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-[8px] border border-gray-100">
                        <label className="block text-[10px] font-black text-ios-gray uppercase tracking-widest mb-2">학년도 설정</label>
                        <div className="flex gap-2">
                            <select 
                                value={selectedYear} 
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="flex-1 bg-white border border-gray-200 rounded-[6px] px-3 py-2 text-xs font-bold text-[#1C1C1E] focus:outline-none focus:ring-1 focus:ring-ios-indigo"
                            >
                                {[academicYear - 2, academicYear - 1, academicYear, academicYear + 1, academicYear + 2].sort().map(year => (
                                    <option key={year} value={year}>{year}학년도</option>
                                ))}
                            </select>
                            <button 
                                onClick={handleYearChange}
                                className="bg-[#1C1C1E] text-white px-3 py-2 rounded-[6px] text-[10px] font-black uppercase whitespace-nowrap hover:bg-gray-800 transition-colors"
                            >
                                전환
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {quarters.map(q => (
                            <div key={q.quarter} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[11px] font-black text-ios-indigo">{q.quarter}분기</p>
                                        {(q.start_date || q.end_date || q.quarter > 4) && (
                                            <button 
                                                onClick={() => handleDeleteQuarter(q.quarter)}
                                                className="p-1 text-ios-gray hover:text-ios-rose transition-colors"
                                                title="기간 삭제"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-[8px] font-bold text-ios-gray bg-gray-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Year {academicYear} - Q{q.quarter}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input 
                                        type="date" 
                                        value={q.start_date || ''} 
                                        onChange={(e) => handleQuarterUpdateLocal(q.quarter, 'start_date', e.target.value)}
                                        className="bg-gray-50 border-none rounded-[6px] px-3 py-2 text-[11px] font-bold focus:ring-1 focus:ring-ios-indigo transition-all"
                                    />
                                    <input 
                                        type="date" 
                                        value={q.end_date || ''} 
                                        onChange={(e) => handleQuarterUpdateLocal(q.quarter, 'end_date', e.target.value)}
                                        className="bg-gray-50 border-none rounded-[6px] px-3 py-2 text-[11px] font-bold focus:ring-1 focus:ring-ios-indigo transition-all"
                                    />
                                </div>
                            </div>
                        ))}
                        <button 
                            onClick={handleAddQuarter}
                            className="w-full py-3 bg-gray-50 text-ios-gray border border-dashed border-gray-200 rounded-[6px] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-gray-100 hover:text-[#1C1C1E] hover:border-gray-300 transition-all active:scale-95"
                        >
                            <Plus className="w-3.5 h-3.5" /> 분기 추가
                        </button>
                    </div>
                </div>

                {/* 2. Default Operating Periods */}
                <div className="bg-white rounded-[6px] border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-ios-indigo" />
                            <h4 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">기본 운영 요일 설정</h4>
                        </div>
                        <button 
                            onClick={saveDefaults}
                            disabled={savingDefaults}
                            className="bg-[#1C1C1E] text-white px-5 py-2.5 rounded-[8px] text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-gray-800 shadow-md transition-all active:scale-95"
                        >
                            <Save className="w-3.5 h-3.5" /> 저장하기
                        </button>
                    </div>
                    <div className="space-y-1 overflow-x-auto">
                        <div className="grid grid-cols-5 gap-2 pb-2 border-b border-gray-100 mb-2">
                            <div className="text-[8px] font-black text-ios-gray uppercase tracking-widest">요일</div>
                            <div className="text-[8px] font-black text-ios-gray uppercase tracking-widest text-center">오전</div>
                            <div className="text-[8px] font-black text-ios-gray uppercase tracking-widest text-center">석식</div>
                            <div className="text-[8px] font-black text-ios-gray uppercase tracking-widest text-center">1차시</div>
                            <div className="text-[8px] font-black text-ios-gray uppercase tracking-widest text-center">2차시</div>
                        </div>
                        {[1, 2, 3, 4, 5, 6, 0].map((dayNum) => {
                            const day = defaults.find(d => d.day_of_week === dayNum) || {
                                day_of_week: dayNum, morning: false, dinner: false, period1: false, period2: false
                            };
                            return (
                                <div key={dayNum} className="grid grid-cols-5 gap-2 items-center py-2 hover:bg-gray-50 rounded-[4px] transition-colors">
                                    <span className={`text-[10px] font-black ${dayNum === 0 ? 'text-ios-rose' : dayNum === 6 ? 'text-ios-indigo' : 'text-[#1C1C1E]'}`}>
                                        {['일', '월', '화', '수', '목', '금', '토'][dayNum]}
                                    </span>
                                    {['morning', 'dinner', 'period1', 'period2'].map(p => (
                                        <div key={p} className="flex justify-center">
                                            <input 
                                                type="checkbox" 
                                                checked={day[p]} 
                                                onChange={() => handleDefaultToggleLocal(dayNum, p)}
                                                className="w-4 h-4 rounded-full border-gray-200 text-ios-indigo focus:ring-ios-indigo/20 transition-all cursor-pointer"
                                            />
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Exceptions / Closures */}
                <div className="bg-white rounded-[6px] border border-gray-100 p-6 shadow-sm flex-1">
                    <div className="flex items-center gap-2 mb-6">
                        <AlertCircle className="w-4 h-4 text-ios-indigo" />
                        <h4 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">휴무(예외) 날짜 등록</h4>
                    </div>
                    
                    <form onSubmit={handleAddException} className="space-y-4 mb-8">
                        <div className="space-y-1">
                            <p className="text-[8px] font-black text-ios-gray uppercase tracking-widest px-1">날짜 선택</p>
                            <input 
                                type="date" 
                                value={newException.date}
                                onChange={(e) => setNewException({...newException, date: e.target.value})}
                                className="w-full bg-gray-50 border-none rounded-[6px] px-3 py-3 text-xs font-bold focus:ring-1 focus:ring-ios-indigo transition-all outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[8px] font-black text-ios-gray uppercase tracking-widest px-1">사유 입력</p>
                            <input 
                                type="text" 
                                placeholder="예: 재량휴업일, 시설 점검 등"
                                value={newException.reason}
                                onChange={(e) => setNewException({...newException, reason: e.target.value})}
                                className="w-full bg-gray-50 border-none rounded-[6px] px-3 py-3 text-xs font-bold focus:ring-1 focus:ring-ios-indigo transition-all outline-none"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!newException.reason}
                            className="w-full py-3 bg-[#1C1C1E] text-white rounded-[6px] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-30 disabled:hover:bg-[#1C1C1E]"
                        >
                            <Plus className="w-3 h-3" /> 등록하기
                        </button>
                    </form>

                    <div className="space-y-2">
                        <p className="text-[8px] font-black text-ios-gray uppercase tracking-widest px-1 border-b border-gray-50 pb-2 mb-4">등록된 예외 목록</p>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                            {exceptions.length === 0 && <p className="text-[10px] text-ios-gray italic text-center py-4">등록된 휴무일이 없습니다.</p>}
                            {exceptions.map(ex => (
                                <div key={ex.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-[6px] hover:bg-ios-rose/5 transition-all group border border-transparent hover:border-ios-rose/10">
                                    <div className="flex-1">
                                        <p className="text-[11px] font-black text-[#1C1C1E]">{ex.exception_date}</p>
                                        <p className="text-[9px] font-bold text-ios-gray truncate">{ex.reason}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleDeleteException(ex.id)}
                                        className="p-1.5 text-ios-gray hover:text-ios-rose transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OperationManager;

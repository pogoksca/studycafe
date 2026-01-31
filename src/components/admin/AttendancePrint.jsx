import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Printer, Calendar, Users, Clock, CheckCircle2, ChevronRight, FileText, Download, Check } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays, isSameDay, getWeek, startOfMonth, startOfQuarter, endOfQuarter, eachWeekOfInterval, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';

const AttendancePrint = () => {
    const [loading, setLoading] = useState(true);
    const [quarters, setQuarters] = useState([]);
    const [selectedQuarter, setSelectedQuarter] = useState(null);
    const [weeks, setWeeks] = useState([]);
    const [selectedWeeks, setSelectedWeeks] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [selectedSessions, setSelectedSessions] = useState([]);
    const [selectedGrades, setSelectedGrades] = useState([1, 2, 3]);
    
    const [isPrinting, setIsPrinting] = useState(false);
    const [printData, setPrintData] = useState([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        // Fetch Quarters - Sorted by year and quarter ascending
        const { data: qData } = await supabase
            .from('operation_quarters')
            .select('*')
            .order('academic_year', { ascending: true })
            .order('quarter', { ascending: true });
        
        if (qData && qData.length > 0) {
            setQuarters(qData);
            
            // Default: Find the quarter closest to today
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            let defaultQ = qData.find(q => todayStr >= q.start_date && todayStr <= q.end_date);
            
            if (!defaultQ) {
                // If not within any quarter, pick the one with the closest start_date or the latest one?
                // User said "closest to today". Let's calculate distance.
                const today = new Date();
                defaultQ = qData.reduce((prev, curr) => {
                    const prevDist = Math.abs(new Date(prev.start_date) - today);
                    const currDist = Math.abs(new Date(curr.start_date) - today);
                    return currDist < prevDist ? curr : prev;
                });
            }
            
            if (defaultQ) handleQuarterChange(defaultQ);
        }

        // Fetch Sessions (Default from first zone)
        const { data: zData } = await supabase.from('zones').select('id').limit(1);
        if (zData && zData.length > 0) {
            const { data: sData } = await supabase
                .from('sessions')
                .select('*')
                .eq('zone_id', zData[0].id)
                .order('start_time', { ascending: true });
            if (sData) {
                setSessions(sData);
                setSelectedSessions(sData.map(s => s.id));
            }
        }
        setLoading(false);
    };

    const handleQuarterChange = (quarter) => {
        setSelectedQuarter(quarter);
        
        // Calculate weeks in quarter
        const startDate = new Date(quarter.start_date);
        const endDate = new Date(quarter.end_date);
        
        const quarterWeeks = eachWeekOfInterval({
            start: startDate,
            end: endDate
        }, { weekStartsOn: 1 }); // Start from Monday

        const weekItems = quarterWeeks.map((weekStart, index) => {
            let weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            
            // Clamp dates to quarter boundaries
            const clampedStart = weekStart < startDate ? startDate : weekStart;
            const clampedEnd = weekEnd > endDate ? endDate : weekEnd;
            
            return {
                id: index + 1,
                start: clampedStart,
                end: clampedEnd,
                label: `${index + 1}주차 (${format(clampedStart, 'MM/dd(eee)', { locale: ko })} - ${format(clampedEnd, 'MM/dd(eee)', { locale: ko })})`
            };
        });

        setWeeks(weekItems);
        setSelectedWeeks(weekItems.map(w => w.id));
    };

    const toggleWeek = (weekId) => {
        setSelectedWeeks(prev => 
            prev.includes(weekId) ? prev.filter(id => id !== weekId) : [...prev, weekId]
        );
    };

    const toggleGrade = (grade) => {
        setSelectedGrades(prev => 
            prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade]
        );
    };

    const toggleSession = (sessionId) => {
        setSelectedSessions(prev => 
            prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId]
        );
    };

    const handlePrint = async () => {
        if (selectedWeeks.length === 0 || selectedGrades.length === 0 || selectedSessions.length === 0) {
            alert('출력할 주차, 학년, 세션을 최소 하나씩 선택해주세요.');
            return;
        }

        setIsPrinting(true);
        
        try {
            // 1. Fetch Students
            const { data: students } = await supabase
                .from('profiles')
                .select('*')
                .in('grade', selectedGrades)
                .eq('role', 'student')
                .order('grade', { ascending: true })
                .order('class_number', { ascending: true })
                .order('student_number', { ascending: true });

            if (!students || students.length === 0) {
                alert('해당하는 학생 정보가 없습니다.');
                setIsPrinting(false);
                return;
            }

            // 2. Prepare Data for Each Selected Week and Grade Combination
            const fullPrintData = [];
            
            for (const weekId of selectedWeeks) {
                const week = weeks.find(w => w.id === weekId);
                const startDateStr = format(week.start, 'yyyy-MM-dd');
                const endDateStr = format(week.end, 'yyyy-MM-dd');

                // Fetch ALL bookings for all selected grades for this week at once (perf optimization)
                const { data: allBookings } = await supabase
                    .from('bookings')
                    .select(`
                        *,
                        attendance(*)
                    `)
                    .gte('date', startDateStr)
                    .lte('date', endDateStr)
                    .in('session_id', selectedSessions);

                const weekDays = eachDayOfInterval({ start: week.start, end: week.end });
                
                // Identify which days have actual bookings
                const datesWithBookings = new Set((allBookings || []).map(b => b.date));
                
                // Keep the day if it's a weekday OR if it has a booking (handles weekend operations)
                const businessDays = weekDays.filter(d => {
                    const isWeekend = [0, 6].includes(d.getDay());
                    const dateStr = format(d, 'yyyy-MM-dd');
                    return !isWeekend || datesWithBookings.has(dateStr);
                });

                // Now loop through each grade to separate into different pages
                for (const grade of selectedGrades.sort()) {
                    const gradeStudents = students.filter(s => s.grade === grade);
                    
                    if (gradeStudents.length === 0) continue;

                    // Filter bookings for students of this specific grade
                    const gradeStudentIds = gradeStudents.map(s => s.id);
                    const gradeBookings = (allBookings || []).filter(b => gradeStudentIds.includes(b.user_id));

                    fullPrintData.push({
                        weekInfo: week,
                        grade: grade,
                        students: gradeStudents,
                        bookings: gradeBookings,
                        businessDays: businessDays,
                        sessions: sessions.filter(s => selectedSessions.includes(s.id))
                    });
                }
            }

            setPrintData(fullPrintData);
            
            // Trigger Print after a short delay for rendering
            setTimeout(() => {
                window.print();
                setIsPrinting(false);
            }, 1000);

        } catch (error) {
            console.error('Print error:', error);
            alert('인쇄 데이터를 불러오는 중 오류가 발생했습니다.');
            setIsPrinting(false);
        }
    };

    if (loading) return (
        <div className="h-full flex flex-col items-center justify-center gap-4 bg-white/50 backdrop-blur-sm">
            <div className="w-10 h-10 border-4 border-ios-indigo border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[13px] font-black text-ios-gray animate-pulse">출석부 시스템 초기화 중...</p>
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-[#F2F2F7]">
            {/* Control Panel (Hide during print) */}
            <div className="flex-1 overflow-y-auto p-8 pt-6 hide-on-print">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-[#1C1C1E] flex items-center justify-center shadow-lg shadow-black/10">
                                <Printer className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">분기별 출석부 출력</h2>
                                <p className="text-sm font-bold text-ios-gray">주차 및 학년별 맞춤 출석부 PDF 생성을 지원합니다.</p>
                            </div>
                        </div>
                        <button 
                            onClick={handlePrint}
                            disabled={isPrinting}
                            className="bg-ios-indigo text-white px-8 py-4 rounded-2xl font-black text-[15px] shadow-lg shadow-ios-indigo/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                        >
                            {isPrinting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    데이터 처리 중
                                </>
                            ) : (
                                <>
                                    <Download className="w-5 h-5" />
                                    PDF 생성 및 인쇄
                                </>
                            )}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* 1. Quarter Selection */}
                        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 flex flex-col">
                            <div className="flex items-center gap-2 mb-6">
                                <Calendar className="w-4 h-4 text-ios-indigo" />
                                <h3 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">분기 선택</h3>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {quarters.map(q => (
                                    <button
                                        key={q.id}
                                        onClick={() => handleQuarterChange(q)}
                                        className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between group ${
                                            selectedQuarter?.id === q.id 
                                                ? 'bg-ios-indigo/5 border-ios-indigo text-ios-indigo' 
                                                : 'bg-white border-gray-50 text-ios-gray hover:border-gray-200'
                                        }`}
                                    >
                                        <div>
                                            <p className="text-[13px] font-black">{q.quarter_name} ({q.academic_year}학년도)</p>
                                            <p className="text-[11px] opacity-70 mt-0.5">
                                                {format(new Date(q.start_date), 'yyyy-MM-dd(eee)', { locale: ko })} ~ {format(new Date(q.end_date), 'yyyy-MM-dd(eee)', { locale: ko })}
                                            </p>
                                        </div>
                                        {selectedQuarter?.id === q.id && <CheckCircle2 className="w-5 h-5" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Grade & Session Selection */}
                        <div className="space-y-6">
                            {/* Grades */}
                            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-2 mb-6">
                                    <Users className="w-4 h-4 text-ios-indigo" />
                                    <h3 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">학년 필터</h3>
                                </div>
                                <div className="flex gap-3">
                                    {[1, 2, 3].map(grade => (
                                        <button
                                            key={grade}
                                            onClick={() => toggleGrade(grade)}
                                            className={`flex-1 py-3 px-4 rounded-xl font-black text-[13px] transition-all border-2 flex items-center justify-between gap-2 ${
                                                selectedGrades.includes(grade)
                                                    ? 'bg-ios-indigo text-white border-ios-indigo shadow-md shadow-ios-indigo/20'
                                                    : 'bg-white text-ios-gray border-gray-100'
                                            }`}
                                        >
                                            <span className="flex-1 text-center">{grade}학년</span>
                                            {selectedGrades.includes(grade) && <Check className="w-4 h-4" strokeWidth={3} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sessions */}
                            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-2 mb-6">
                                    <Clock className="w-4 h-4 text-ios-indigo" />
                                    <h3 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">출력 세션</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {sessions.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => toggleSession(s.id)}
                                            className={`py-3 px-4 rounded-xl font-black text-[12px] transition-all border-2 flex items-center justify-between ${
                                                selectedSessions.includes(s.id)
                                                    ? 'bg-ios-indigo/5 border-ios-indigo text-ios-indigo'
                                                    : 'bg-white text-ios-gray border-gray-100'
                                            }`}
                                        >
                                            <span>{s.name}</span>
                                            {selectedSessions.includes(s.id) && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Week Selection */}
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-ios-indigo" />
                                <h3 className="text-sm font-black text-[#1C1C1E] uppercase tracking-wider">출력 주차 선택 (A4 1장/주)</h3>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setSelectedWeeks(weeks.map(w => w.id))}
                                    className="text-[11px] font-black text-ios-indigo hover:underline"
                                >
                                    전체 선택
                                </button>
                                <span className="text-gray-200">|</span>
                                <button 
                                    onClick={() => setSelectedWeeks([])}
                                    className="text-[11px] font-black text-ios-rose hover:underline"
                                >
                                    해제
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {weeks.map(w => (
                                <button
                                    key={w.id}
                                    onClick={() => toggleWeek(w.id)}
                                    className={`relative p-4 rounded-2xl border-2 transition-all group ${
                                        selectedWeeks.includes(w.id)
                                            ? 'bg-ios-indigo/5 border-ios-indigo'
                                            : 'bg-white border-gray-100 hover:border-gray-200'
                                    }`}
                                >
                                    <p className={`text-[13px] font-black ${selectedWeeks.includes(w.id) ? 'text-ios-indigo' : 'text-[#1C1C1E]'}`}>{w.id}주차</p>
                                    <p className="text-[10px] text-ios-gray font-bold mt-1">
                                        {format(w.start, 'MM/dd(eee)', { locale: ko })} - {format(w.end, 'MM/dd(eee)', { locale: ko })}
                                    </p>
                                    {selectedWeeks.includes(w.id) && (
                                        <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-ios-indigo text-white shadow-sm scale-110">
                                            <Check className="w-3 h-3" strokeWidth={4} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Area - use opacity-0 to hide from users but keep 'block' for print engines */}
            <div className={`print-area ${isPrinting ? 'block opacity-0 pointer-events-none' : 'hidden'} fixed inset-0 z-[-1]`}>
                <style>{`
                    @media print {
                        @page { 
                            size: A4 portrait; 
                            margin: 20mm 10mm 10mm 10mm; 
                        }
                        
                        /* Reset EVERYTHING to non-scrolling block layout */
                        html, body, #root, #root > div, main, main > div, 
                        .flex-1.flex, .admin-content-view, 
                        div[class*="rounded-2xl"], div[class*="bg-white"],
                        .flex-1.bg-\\[\\#F2F2F7\\] { 
                            height: auto !important;
                            overflow: visible !important;
                            display: block !important;
                            position: static !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            border: none !important;
                            box-shadow: none !important;
                            flex: none !important;
                            width: 100% !important;
                        }

                        /* Hide app UI */
                        header, aside, .sidebar, .header, .nav-tabs, .selection-ui, .hide-on-print { 
                            display: none !important;
                        }

                        /* Force the printable content back to visible and opacity-1 */
                        .print-area { 
                            display: block !important; 
                            visibility: visible !important;
                            opacity: 1 !important;
                            position: static !important;
                            z-index: auto !important;
                        }

                        .print-area * {
                            visibility: visible !important;
                        }

                        /* Use standard flow for reliable pagination */
                        .print-area {
                            display: block !important;
                            position: static !important;
                            width: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                        }

                        .page-break { 
                            display: block !important;
                            page-break-after: always !important;
                            break-after: page !important;
                            width: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            position: relative !important;
                        }

                        /* Ensure no top margin on the first page beyond the @page margin */
                        .page-break:first-child {
                            margin-top: 0 !important;
                        }

                        .header-row { 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: flex-end; 
                            margin: 0 0 10px 0 !important; 
                            padding: 0 0 5px 0 !important;
                            border-bottom: 2px solid #000 !important; 
                        }
                        
                        .school-title { 
                            font-size: 20px !important; 
                            font-weight: 900 !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            line-height: 1 !important;
                        }

                        .doc-title {
                            font-size: 10px !important;
                            margin: 0 !important;
                            padding: 0 !important;
                        }

                        .attendance-table { 
                            width: 100% !important; 
                            border-collapse: collapse !important; 
                            margin: 10px 0 0 0 !important;
                            font-size: 10px !important; 
                            table-layout: fixed !important;
                        }

                        .attendance-table th, .attendance-table td { 
                            border: 1px solid #000 !important; 
                            padding: 4px !important; 
                            text-align: center !important; 
                        }

                        .attendance-table th { 
                            background-color: #eee !important; 
                            -webkit-print-color-adjust: exact !important;
                        }
                    }
                `}</style>

                <div className="print-root">
                    {printData.map((page, pIdx) => (
                        <div key={pIdx} className="page-break">
                            <div className="header-row">
                                <h1 className="school-title">출 석 부 ({selectedQuarter?.quarter_name}, {page.weekInfo.id}주차)</h1>
                                <div className="doc-title">
                                    {format(page.weekInfo.start, 'yyyy-MM-dd(eee)', { locale: ko })} ~ {format(page.weekInfo.end, 'yyyy-MM-dd(eee)', { locale: ko })}
                                </div>
                            </div>

                            <div className="flex justify-between items-center mb-2 px-1 text-[10px] font-bold">
                                <div className="flex gap-4">
                                    <span>학년도: {selectedQuarter?.academic_year}</span>
                                    <span>대상: {page.grade}학년</span>
                                </div>
                            </div>

                            <table className="attendance-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>No</th>
                                        <th style={{ width: '100px' }}>학년/반/번호</th>
                                        <th style={{ width: '100px' }}>성명</th>
                                        {page.businessDays.map(day => (
                                            <th key={day.toString()} colSpan={page.sessions.length}>
                                                {format(day, 'MM/dd')} ({format(day, 'E', { locale: ko })[0]})
                                            </th>
                                        ))}
                                    </tr>
                                    <tr>
                                        <th colSpan={3}>학습차시</th>
                                        {page.businessDays.map(day => 
                                            page.sessions.map(s => (
                                                <th key={`${day}-${s.id}`} style={{ fontSize: '8px', padding: '2px 0' }}>{s.name}</th>
                                            ))
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {page.students.map((student, sIdx) => (
                                        <tr key={student.id}>
                                            <td>{sIdx + 1}</td>
                                            <td>
                                                {student.grade}
                                                {String(student.class_number).padStart(2, '0')}
                                                {String(student.student_number).padStart(2, '0')}
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{student.full_name}</td>
                                            {page.businessDays.map(day => {
                                                const dateStr = format(day, 'yyyy-MM-dd');
                                                return page.sessions.map(s => {
                                                    const booking = page.bookings.find(b => 
                                                        b.user_id === student.id && 
                                                        b.date === dateStr && 
                                                        b.session_id === s.id
                                                    );
                                                    const attStatus = booking?.attendance?.[0]?.status;
                                                    const displayText = attStatus === 'present' ? 'O' : attStatus === 'late' ? '△' : attStatus === 'early' ? '조' : booking ? '' : '-';
                                                    
                                                    return (
                                                        <td key={`${student.id}-${dateStr}-${s.id}`} style={{ fontSize: '9px', color: attStatus === 'absent' ? '#ff3b30' : 'inherit' }}>
                                                            {displayText}
                                                        </td>
                                                    );
                                                });
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AttendancePrint;

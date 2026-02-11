import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Check, User, PenTool, Search, LogOut, ChevronRight, ChevronLeft, Menu, MapPin, Clock, X, Layout, Users, CheckCircle2, Calendar, Pencil, Trophy } from 'lucide-react';
import { format, addDays, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import AttendanceManager from '../admin/AttendanceManager';
import BookingWizard from '../booking/BookingWizard';
import SeatManualSelectionModal from '../booking/SeatManualSelectionModal';
import '../../styles/mobile.css';

const SignaturePad = ({ onSave, onCancel, teacherName }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        ctx.strokeStyle = '#1C1C1E';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        setIsDrawing(true);
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
        setHasDrawn(true);
    };

    const stopDrawing = () => setIsDrawing(false);

    const handleSave = () => {
        if (!hasDrawn) return alert('서명을 입력해 주세요.');
        const canvas = canvasRef.current;
        canvas.toBlob((blob) => onSave(blob), 'image/png');
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col justify-end">
            <div className="bg-white/90 backdrop-blur-2xl rounded-t-[32px] p-6 mobile-slide-up h-[70vh] border-t border-white/20">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">{teacherName}님</h2>
                        <p className="text-ios-gray text-sm font-bold opacity-70">오늘의 감독 확인을 위해 서명해 주세요.</p>
                    </div>
                    <button onClick={onCancel} className="p-2.5 bg-gray-100/50 rounded-apple-md ios-tap">
                        <X className="w-5 h-5 text-ios-gray" />
                    </button>
                </div>

                <div className="mobile-signature-pad mb-8">
                    <canvas
                        ref={canvasRef}
                        style={{ width: '100%', height: '100%' }}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => {
                            const ctx = canvasRef.current.getContext('2d');
                            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                            setHasDrawn(false);
                        }}
                        className="py-4 bg-gray-100/80 text-[#1C1C1E] rounded-apple-md font-black ios-tap"
                    >
                        다시 그리기
                    </button>
                    <button 
                        onClick={handleSave}
                        className="py-4 bg-[#007AFF] text-white rounded-apple-md font-black ios-tap shadow-lg shadow-blue-500/20"
                    >
                        서명 저장
                    </button>
                </div>
            </div>
        </div>
    );
};

const TeacherMobileView = ({ onLogout, currentUser }) => {
    const seatmapRef = useRef(null);
    const [currentView, setCurrentView] = useState('menu');
    const [loading, setLoading] = useState(true);
    const [todayAssignments, setTodayAssignments] = useState([]);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [showSignPad, setShowSignPad] = useState(false);
    const [attendanceData, setAttendanceData] = useState([]);
    const zoneRefs = {
        A: useRef(null),
        B: useRef(null),
        C: useRef(null)
    };
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [zones, setZones] = useState([]);
    const [selectedZoneId, setSelectedZoneId] = useState(null);
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [reservationViewStep, setReservationViewStep] = useState('search');
    const [proxySearchQuery, setProxySearchQuery] = useState('');
    const [proxySearchResults, setProxySearchResults] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isProxySearching, setIsProxySearching] = useState(false);
    const [isManualSeatModalOpen, setIsManualSeatModalOpen] = useState(false);
    const [selectedSeat, setSelectedSeat] = useState(null);
    const [schoolName, setSchoolName] = useState('');
    const [rankingData, setRankingData] = useState([]);
    const [isRankingLoading, setIsRankingLoading] = useState(false);
    const [quarters, setQuarters] = useState([]);

    const todayDate = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        fetchInitialData();
        fetchSchoolInfo();
    }, []);

    useEffect(() => {
        fetchSupervisionData();
    }, [selectedDate]);

    useEffect(() => {
        if (selectedZoneId) {
            fetchSessions();
        }
    }, [selectedZoneId]);

    useEffect(() => {
        if (activeSession && (currentView === 'attendance' || currentView === 'seatmap')) {
            fetchAttendanceList();
        }
    }, [activeSession, currentView, selectedDate, selectedZoneId]);

    const fetchInitialData = async () => {
        setLoading(true);
        const { data: zoneData } = await supabase.from('zones').select('*').eq('is_active', true).order('created_at', { ascending: true });
        
        let initialDate = format(new Date(), 'yyyy-MM-dd');

        if (zoneData && zoneData.length > 0) {
            setZones(zoneData);
            const firstZoneId = zoneData[0].id;
            setSelectedZoneId(firstZoneId);

            const [qData, eData, sData] = await Promise.all([
                supabase.from('operation_quarters').select('*').order('academic_year', { ascending: false }).order('quarter', { ascending: true }),
                supabase.from('operation_exceptions').select('*').eq('zone_id', firstZoneId),
                supabase.from('sessions').select('id').eq('zone_id', firstZoneId)
            ]);

            if (qData.data) setQuarters(qData.data);

            if (sData.data && sData.data.length > 0) {
                const { data: rulesData } = await supabase
                    .from('session_operating_days')
                    .select('session_id, day_of_week')
                    .in('session_id', sData.data.map(s => s.id))
                    .eq('is_active', true);

                initialDate = findNextOperatingDate(new Date(), qData.data || [], eData.data || [], rulesData || []);
                setSelectedDate(initialDate);
            }
        }
        
        const { data: supervisionData } = await supabase
            .from('supervision_assignments')
            .select('*')
            .eq('date', initialDate);
        
        if (supervisionData) setTodayAssignments(supervisionData);
        setLoading(false);
    };

    const fetchSchoolInfo = async () => {
        const { data } = await supabase.from('configs').select('value').eq('key', 'school_info').single();
        if (data?.value?.name_en) setSchoolName(data.value.name_en);
    };

    const findNextOperatingDate = (startDate, quarters, exceptions, rules) => {
        let current = startOfDay(startDate);
        for (let i = 0; i < 30; i++) {
            const dStr = format(current, 'yyyy-MM-dd');
            if (checkIsOperating(current, quarters, exceptions, rules)) {
                return dStr;
            }
            current = addDays(current, 1);
        }
        return format(startDate, 'yyyy-MM-dd');
    };

    const checkIsOperating = (date, quarters, exceptions, rules) => {
        const dStr = format(date, 'yyyy-MM-dd');
        if (quarters.length > 0) {
            const isInQuarter = quarters.some(q =>
                q.start_date && q.end_date &&
                isWithinInterval(date, {
                    start: parseISO(q.start_date),
                    end: parseISO(q.end_date)
                })
            );
            if (!isInQuarter) return false;
        }
        const isException = exceptions.some(e => e.exception_date === dStr);
        if (isException) return false;
        if (rules.length > 0) {
            const dayOfWeek = date.getDay();
            const hasRule = rules.some(r => r.day_of_week === dayOfWeek);
            if (!hasRule) return false;
        }
        return true;
    };

    const fetchSupervisionData = async () => {
        const { data } = await supabase
            .from('supervision_assignments')
            .select('*')
            .eq('date', selectedDate);
        
        if (data) setTodayAssignments(data);
        setLoading(false);
    };

    const fetchSessions = async () => {
        if (!selectedZoneId) return;
        const { data } = await supabase
            .from('sessions')
            .select('*')
            .eq('zone_id', selectedZoneId)
            .order('start_time', { ascending: true });
            
        if (data && data.length > 0) {
            setSessions(data);
            const nowTime = format(new Date(), 'HH:mm:ss');
            let candidate = null;
            for (let i = 0; i < data.length; i++) {
                const s = data[i];
                if (nowTime <= s.end_time) {
                    candidate = s;
                    break;
                }
            }
            setActiveSession(candidate ? candidate.id : data[data.length - 1]?.id);
        }
    };

    const fetchAttendanceList = async () => {
        setLoading(true);
        const { data: allSeats, error: seatsError } = await supabase
            .from('seats')
            .select('*, zone_color')
            .order('seat_number', { ascending: true });

        if (seatsError) {
            console.error('[Debug] Error fetching seats:', seatsError);
            setLoading(false);
            return;
        }

        const { data: allDailyBookings } = await supabase
            .from('bookings')
            .select(`
                id, seat_id, session_id,
                profiles (full_name, username, grade),
                profiles_student (full_name, username, grade),
                attendance (id, status, timestamp_in, timestamp_out)
            `)
            .eq('date', selectedDate);
        
        if (allSeats) {
            const formatted = allSeats.map(s => {
                const activeBooking = (allDailyBookings || []).find(b => b.seat_id === s.id && b.session_id === activeSession);
                const isBookedToday = (allDailyBookings || []).some(b => b.seat_id === s.id);
                const attData = activeBooking?.attendance;
                const attendance = Array.isArray(attData) ? attData[0] : attData;
                const occupant = activeBooking?.profiles_student || activeBooking?.profiles;

                return {
                    seat_id: s.id,
                    place_id: s.zone_id,
                    zone_id: s.zone_id,
                    seat_number: s.seat_number,
                    display_number: s.display_number,
                    zone_name: s.zone_name,
                    zone_color: s.zone_color,
                    booking_id: activeBooking?.id,
                    full_name: occupant?.full_name,
                    username: occupant?.username,
                    grade: occupant?.grade,
                    attendance_id: attendance?.id,
                    status: attendance?.status || 'absent',
                    timestamp_in: attendance?.timestamp_in,
                    timestamp_out: attendance?.timestamp_out,
                    is_active: !!activeBooking,
                    is_booked_today: isBookedToday
                };
            });
            formatted.sort((a, b) => (a.seat_number || '').localeCompare(b.seat_number || '', undefined, { numeric: true, sensitivity: 'base' }));
            setAttendanceData(formatted);
        }
        setLoading(false);
    };

    const handleSignatureSave = async (blob) => {
        const fileName = `sig_duty_${selectedTeacher.id}_${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
            .from('signatures')
            .upload(fileName, blob, { contentType: 'image/png' });

        if (uploadError) return alert('이미지 저장 오류');

        const { data: { publicUrl } } = supabase.storage.from('signatures').getPublicUrl(fileName);
        const { error: updateError } = await supabase
            .from('supervision_assignments')
            .update({ signature_url: publicUrl })
            .eq('id', selectedTeacher.id);

        if (!updateError) {
            setShowSignPad(false);
            fetchSupervisionData();
        }
    };

    const getKSTISOString = () => {
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstTime = new Date(now.getTime() + kstOffset);
        return kstTime.toISOString().replace('Z', '+09:00');
    };

    const toggleAttendance = async (item) => {
        if (item.status !== 'absent') return;
        const nextStatus = 'present';
        const upsertData = {
            booking_id: item.booking_id,
            status: nextStatus,
            updated_at: new Date().toISOString()
        };

        if (item.attendance_id) upsertData.id = item.attendance_id;

        if (!item.timestamp_in) {
            const currentSessionData = sessions.find(s => s.id === activeSession);
            if (currentSessionData) {
                const startTime = currentSessionData.start_time.length === 5 
                    ? currentSessionData.start_time + ':00' 
                    : currentSessionData.start_time;
                upsertData.timestamp_in = `${selectedDate}T${startTime}+09:00`;
                upsertData.status = 'present';
            } else {
                upsertData.timestamp_in = getKSTISOString();
            }
        }

        const { data: updatedRecord, error } = await supabase
            .from('attendance')
            .upsert(upsertData, { onConflict: 'booking_id' })
            .select()
            .single();

        if (error) {
            console.error('[Attendance Update Error]', error);
            fetchAttendanceList();
            return;
        }

        if (updatedRecord) {
            setAttendanceData(prev => prev.map(d => 
                d.booking_id === item.booking_id 
                ? { ...d, status: updatedRecord.status, attendance_id: updatedRecord.id, timestamp_in: updatedRecord.timestamp_in }
                : d
            ));
        }
    };

    const resetAttendance = async (item) => {
        if (!item.attendance_id) return;
        try {
            const { error } = await supabase.from('attendance').delete().eq('id', item.attendance_id);
            if (error) throw error;
            fetchAttendanceList();
        } catch (error) {
            console.error('Error resetting attendance:', error);
        }
    };

    const handleLogout = () => { if (onLogout) onLogout(); };

    const fetchRankingData = async () => {
        setIsRankingLoading(true);
        try {
            // Determine current academic year
            const now = new Date();
            const monthVal = now.getMonth() + 1;
            const currentYear = monthVal < 3 ? now.getFullYear() - 1 : now.getFullYear();

            // Find the start date of the academic year (minimum start_date for this year)
            const yearQuarters = quarters.filter(q => q.academic_year === currentYear && q.start_date);
            const startDates = yearQuarters.map(q => parseISO(q.start_date));
            const academicStart = startDates.length > 0 ? format(new Date(Math.min(...startDates)), 'yyyy-MM-dd') : `${currentYear}-03-01`;

            const { data: bookings } = await supabase
                .from('bookings')
                .select(`
                    date,
                    profiles(full_name, username),
                    profiles_student(full_name, username),
                    sessions(end_time),
                    attendance(timestamp_in, timestamp_out, status)
                `)
                .gte('date', academicStart)
                .lte('date', todayDate);

            if (bookings) {
                const studentStats = {};

                bookings.forEach(b => {
                    const student = b.profiles_student || b.profiles;
                    if (!student) return;

                    const attendeeList = Array.isArray(b.attendance) ? b.attendance : [b.attendance];
                    
                    attendeeList.forEach(attendee => {
                        // Only count if confirmed or has timestamp_in
                        if (!attendee || !attendee.timestamp_in) return;
                        if (attendee.status === 'absent') return;

                        const startTime = new Date(attendee.timestamp_in);
                        let endTime;

                        if (attendee.timestamp_out) {
                            endTime = new Date(attendee.timestamp_out);
                        } else {
                            // Handle missing checkout
                            if (b.date === todayDate) {
                                // Ongoing today
                                endTime = new Date();
                            } else {
                                // Past date: Cap at session end time or end of day
                                try {
                                    if (b.sessions?.end_time) {
                                        // Combine booking date and session end_time
                                        endTime = new Date(`${b.date}T${b.sessions.end_time}:00`);
                                    } else {
                                        // Fallback to end of day
                                        endTime = new Date(`${b.date}T23:59:59`);
                                    }
                                } catch (e) {
                                    endTime = startTime; // Fallback
                                }
                            }
                        }
                        
                        const durationMs = Math.max(0, endTime - startTime);
                        const durationMin = Math.floor(durationMs / (1000 * 60));

                        // Cap individual duration at 14 hours to prevent extreme data errors
                        const finalDuration = Math.min(durationMin, 14 * 60);

                        if (finalDuration <= 0) return;

                        if (!studentStats[student.username]) {
                            studentStats[student.username] = {
                                name: student.full_name,
                                username: student.username,
                                totalMinutes: 0
                            };
                        }
                        studentStats[student.username].totalMinutes += finalDuration;
                    });
                });

                const sortedData = Object.values(studentStats)
                    .sort((a, b) => b.totalMinutes - a.totalMinutes)
                    .slice(0, 50);

                setRankingData(sortedData);
            }
        } catch (err) {
            console.error('Error fetching cumulative ranking data:', err);
        } finally {
            setIsRankingLoading(false);
        }
    };

    const changeDate = (days) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(format(date, 'yyyy-MM-dd'));
    };

    const renderHeader = () => {
        if (currentView === 'attendance' || currentView === 'reservation' || currentView === 'supervision' || currentView === 'ranking') {
            const title = 
                currentView === 'attendance' ? '출결 체크' : 
                currentView === 'reservation' ? '학생 좌석 예약' : 
                currentView === 'ranking' ? '학습 랭킹' :
                '감독 서명';

            return (
                <div className="mobile-header flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 z-50">
                    <button 
                        onClick={() => {
                            if (currentView === 'reservation' && reservationViewStep === 'booking') {
                                setReservationViewStep('search');
                                setSelectedStudent(null);
                            } else {
                                setCurrentView('menu');
                            }
                        }}
                        className="p-2 -ml-2 text-gray-400 hover:text-black active:scale-95 transition-all"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="mobile-header-title text-lg font-black text-[#1C1C1E] tracking-tight">{title}</h1>
                    <div className="w-10" />
                </div>
            );
        }

        return (
            <header className="flex-none glass-header px-6 pt-4 pb-4 flex items-center justify-between shadow-sm z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="flex flex-col">
                    <h1 className="text-xl font-black text-[#1C1C1E] tracking-tight">{schoolName.split(' ')[0] || '학습실 카페'}</h1>
                    <p className="text-[9px] font-black text-ios-indigo tracking-[0.2em] uppercase opacity-70 leading-none mt-1">Study Cafe Manager</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-ios-gray uppercase tracking-widest leading-none mb-1">선생님</span>
                        <span className="text-sm font-black text-[#1C1C1E]">{currentUser?.full_name}</span>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="p-2 bg-ios-rose/5 text-ios-rose border border-ios-rose/10 rounded-apple-md ios-tap transition-all hover:bg-ios-rose/10"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </header>
        );
    };

    const renderMenuView = () => (
        <div className="mobile-menu-container">
            <div className="mobile-menu-grid">
                <button onClick={() => setCurrentView('supervision')} className="mobile-menu-btn">
                    <div className="mobile-menu-btn-icon bg-blue-50">
                        <PenTool className="w-8 h-8 text-[#007AFF]" />
                    </div>
                    <span className="mobile-menu-btn-text">감독 서명</span>
                </button>
                <button onClick={() => setCurrentView('attendance')} className="mobile-menu-btn">
                    <div className="mobile-menu-btn-icon bg-rose-50">
                        <Check className="w-8 h-8 text-[#FF3B30]" />
                    </div>
                    <span className="mobile-menu-btn-text">출결 체크</span>
                </button>
                <button onClick={() => { setCurrentView('reservation'); setReservationViewStep('search'); }} className="mobile-menu-btn">
                    <div className="mobile-menu-btn-icon bg-indigo-50">
                        <Calendar className="w-8 h-8 text-ios-indigo" />
                    </div>
                    <span className="mobile-menu-btn-text">학생 좌석 예약</span>
                </button>
                <button onClick={() => { setCurrentView('ranking'); fetchRankingData(); }} className="mobile-menu-btn">
                    <div className="mobile-menu-btn-icon bg-amber-50">
                        <Trophy className="w-8 h-8 text-ios-amber" />
                    </div>
                    <span className="mobile-menu-btn-text">학습 랭킹</span>
                </button>
            </div>
            {todayDate && (
                <div className="text-center">
                    <p className="text-sm font-bold text-gray-400">오늘은 {format(new Date(), 'yyyy년 M월 d일')} 입니다.</p>
                </div>
            )}
        </div>
    );

    const renderSupervisionView = () => (
        <main className="flex-1 flex flex-col h-full overflow-hidden" style={{ padding: '0 1rem 1rem 1rem' }}>
            <div className="flex-1 flex flex-col gap-4 h-full overflow-y-auto pb-6 pt-2">
                {todayAssignments.map((assign) => (
                    <div key={assign.id} className="flex-1 min-h-[300px] bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                        <div className="flex flex-col items-center gap-4 w-full">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center shadow-inner">
                                <User className="w-8 h-8 text-[#8E8E93]" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-black text-[#1C1C1E]">{assign.supervisor_name} 선생님</h3>
                                {assign.signature_url ? (
                                    <p className="mt-1.5 text-xs font-bold text-emerald-500 flex items-center justify-center gap-1.5">
                                        <Check className="w-4 h-4" /> 감독교사 서명 완료
                                    </p>
                                ) : (
                                    <p className="mt-1.5 text-xs font-bold text-[#FF9500]">감독 확인 서명이 필요합니다</p>
                                )}
                            </div>
                            {!assign.signature_url && (
                                <button onClick={() => { setSelectedTeacher(assign); setShowSignPad(true); }} className="w-full py-5 bg-[#007AFF] text-white rounded-2xl text-base font-black mobile-tap-feedback shadow-lg shadow-blue-100">
                                    서명하기
                                </button>
                            )}
                            {assign.signature_url && (
                                <div className="w-full bg-gray-50 rounded-2xl p-4 flex items-center justify-center border border-dashed border-gray-200 min-h-[100px]">
                                    <img src={assign.signature_url} alt="Signature" className="max-h-16 opacity-60 object-contain" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {todayAssignments.length === 0 && (
                    <div className="flex-1 bg-white rounded-[32px] border border-dashed border-gray-200 text-gray-400 text-center flex items-center justify-center p-6">
                        <p className="text-base font-bold">오늘 배정된 감독 교사가 없습니다.</p>
                    </div>
                )}
            </div>
        </main>
    );

    const renderAttendanceView = () => (
        <main className="mobile-attendance-list">
            <div className="mobile-zone-grid">
                {['A', 'B', 'C'].map(zoneLetter => {
                    const zoneSeats = attendanceData.filter(item => item.zone_name?.startsWith(zoneLetter) || item.seat_number?.startsWith(zoneLetter));
                    const fallbackColor = zoneLetter === 'A' ? '#34C759' : zoneLetter === 'B' ? '#FF9500' : '#FF3B30';
                    return (
                        <div key={zoneLetter} className="zone-column">
                            <div className="zone-title-bar" style={{ backgroundColor: zoneSeats[0]?.zone_color || fallbackColor }}>{zoneLetter} ZONE</div>
                            <div className="zone-divider" />
                            <div className="zone-seats-list">
                                {zoneSeats.map((item) => {
                                    const tierClass = item.is_active ? 'tier-active' : item.is_booked_today ? 'tier-reserved' : 'tier-empty';
                                    const headerColor = item.zone_color || fallbackColor;
                                    const dotColor = item.status === 'present' ? 'green' : 'red';
                                    return (
                                        <div key={item.seat_id} className={`mobile-grid-card ${tierClass}`}>
                                            <div className="grid-card-header" style={{ backgroundColor: headerColor }}>
                                                {item.display_number || item.seat_number.replace(`${zoneLetter}-`, '')}
                                                {item.is_active && <div className={`status-dot ${dotColor}`} />}
                                            </div>
                                            <div className="grid-card-body">
                                                {item.full_name ? (
                                                    <><span className="grid-card-student">{item.full_name}</span><span className="grid-card-id">{item.username}</span></>
                                                ) : <span className="grid-card-info text-gray-300">공석</span>}
                                            </div>
                                            <div className="grid-card-footer">
                                                {item.full_name ? (
                                                    item.status === 'absent' ? (
                                                        <><div className="grid-status-btn status-absent-btn">미출석</div><button className="grid-action-btn" onClick={() => toggleAttendance(item)} style={{ backgroundColor: headerColor }}>출석처리</button></>
                                                    ) : (
                                                        <><div className={`grid-status-btn ${item.status === 'present' ? 'status-present-active' : item.status === 'late' ? 'status-late-active' : 'status-early-active'}`} style={{ backgroundColor: item.status === 'present' ? headerColor : undefined }}>{item.status === 'present' ? '학습중' : '지각'}</div><button className="grid-action-btn subtle" onClick={() => resetAttendance(item)}>결석처리</button></>
                                                    )
                                                ) : <div className="grid-status-btn status-absent-btn opacity-20">-</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
    );

    const renderRankingView = () => {
        const now = new Date();
        const monthVal = now.getMonth() + 1;
        const currentYear = monthVal < 3 ? now.getFullYear() - 1 : now.getFullYear();
        const yearQuarters = quarters.filter(q => q.academic_year === currentYear && q.start_date);
        const startDates = yearQuarters.map(q => parseISO(q.start_date));
        const academicStartStr = startDates.length > 0 ? format(new Date(Math.min(...startDates)), 'yyyy.MM.dd') : `${currentYear}.03.01`;

        return (
            <main className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50/50">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-4">
                        <p className="text-xs font-bold text-ios-gray uppercase tracking-widest leading-none mb-1">집계 기간</p>
                        <p className="text-base font-black text-[#1C1C1E]">
                            {academicStartStr} ~ 오늘
                            <span className="ml-2 px-2 py-0.5 bg-ios-amber/10 text-ios-amber text-[10px] rounded-full">누적</span>
                        </p>
                    </div>

                    {isRankingLoading ? (
                        <div className="flex-1 flex items-center justify-center py-20">
                            <div className="inline-block w-8 h-8 border-4 border-ios-amber/20 border-t-ios-amber rounded-full animate-spin"></div>
                        </div>
                    ) : rankingData.length > 0 ? (
                        rankingData.map((student, index) => (
                            <div key={student.username} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${index * 50}ms` }}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                                        index === 0 ? 'bg-amber-100 text-ios-amber ring-2 ring-amber-50' : 
                                        index === 1 ? 'bg-slate-100 text-slate-500' : 
                                        index === 2 ? 'bg-orange-100 text-orange-600' : 
                                        'bg-gray-50 text-gray-400'
                                    }`}>
                                        {index + 1}
                                    </div>
                                    <div>
                                        <p className="text-base font-black text-[#1C1C1E]">{student.name}</p>
                                        <p className="text-[10px] font-bold text-ios-gray uppercase tracking-tighter">{student.username}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-ios-amber">
                                        {student.totalMinutes >= 60 
                                            ? `${Math.floor(student.totalMinutes / 60)}시간 ${student.totalMinutes % 60}분` 
                                            : `${student.totalMinutes}분`
                                        }
                                    </p>
                                    <p className="text-[9px] font-bold text-ios-gray uppercase tracking-widest leading-none mt-1">총 학습 시간</p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-20 text-center bg-white rounded-[32px] border border-dashed border-gray-200">
                            <Trophy className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-sm font-bold text-gray-400">데이터가 없습니다.</p>
                            <p className="text-[10px] text-gray-300 mt-2 px-8">이번 학년도에 공부한 학생 데이터가 아직 없습니다.</p>
                        </div>
                    )}
                </div>
            </main>
        );
    };

    const handleProxySearch = async (queryInput) => {
        const query = queryInput.trim();
        if (!query) return;
        setIsProxySearching(true);
        try {
            const { data } = await supabase.from('profiles_student').select('*').or(`full_name.ilike.%${query}%,username.ilike.%${query}%`).limit(20);
            setProxySearchResults(data || []);
        } catch (err) { console.error('Search Exception:', err); }
        finally { setIsProxySearching(false); }
    };

    const renderReservationView = () => (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {reservationViewStep === 'search' ? (
                <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4">
                    <div className="max-w-md mx-auto space-y-6">
                        <div className="space-y-2"><h2 className="text-xl font-black text-[#1C1C1E]">학생 검색</h2><p className="text-sm font-bold text-ios-gray">이름 또는 학번을 입력하세요.</p></div>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-ios-indigo transition-colors" />
                            <input type="text" placeholder="검색..." value={proxySearchQuery} onChange={(e) => { setProxySearchQuery(e.target.value); handleProxySearch(e.target.value); }} className="w-full bg-white border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-base font-bold shadow-sm outline-none focus:ring-2 focus:ring-ios-indigo/10" />
                        </div>
                        <div className="space-y-3 pb-8">
                            {isProxySearching ? <div className="text-center py-8"><div className="inline-block w-6 h-6 border-4 border-ios-indigo/20 border-t-ios-indigo rounded-full animate-spin"></div></div> :
                                proxySearchResults.map(student => (
                                    <button key={student.id} onClick={() => { setSelectedStudent(student); setReservationViewStep('booking'); setSelectedSeat(null); }} className="w-full bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Users className="w-5 h-5 text-gray-400" /></div>
                                            <div className="text-left"><p className="text-base font-black text-[#1C1C1E]">{student.full_name}</p><p className="text-xs font-bold text-ios-gray uppercase">{student.username}</p></div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-gray-300" />
                                    </button>
                                ))
                            }
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden bg-white">
                    <div className="flex-none p-4 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur sticky top-0 z-20">
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-ios-indigo/10 flex items-center justify-center"><Users className="w-4 h-4 text-ios-indigo" /></div><div><p className="text-sm font-black text-[#1C1C1E]">{selectedStudent?.full_name} ({selectedStudent?.username})</p></div></div>
                        <button onClick={() => { setSelectedStudent(null); setReservationViewStep('search'); }} className="text-xs font-black text-ios-indigo bg-ios-indigo/5 px-3 py-1.5 rounded-full">변경</button>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                        <BookingWizard selectedSeat={selectedSeat} onComplete={() => { setCurrentView('menu'); setSelectedStudent(null); setReservationViewStep('search'); }} targetUser={selectedStudent} loggedInUser={currentUser} initialDate={selectedDate} onDateChange={setSelectedDate} currentZoneId={selectedZoneId || (zones.length > 0 ? zones[0].id : null)} onOpenSeatModal={() => setIsManualSeatModalOpen(true)} />
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="mobile-dashboard-container h-[100dvh] overflow-hidden flex flex-col">
            {renderHeader()}
            {loading ? <div className="flex-1 flex items-center justify-center"><p className="text-sm font-bold text-gray-400">로딩 중...</p></div> : (
                <>
                    {currentView === 'menu' && renderMenuView()}
                    {currentView === 'supervision' && renderSupervisionView()}
                    {currentView === 'attendance' && renderAttendanceView()}
                    {currentView === 'reservation' && renderReservationView()}
                    {currentView === 'ranking' && renderRankingView()}
                </>
            )}
            <SeatManualSelectionModal isOpen={isManualSeatModalOpen} onClose={() => setIsManualSeatModalOpen(false)} zoneId={selectedZoneId || (zones.length > 0 ? zones[0].id : null)} currentUser={selectedStudent || currentUser} onOpenMap={() => alert('모바일에서는 좌석 번호 선택기를 권장합니다.')} onSelect={(seat) => { setSelectedSeat(seat); setIsManualSeatModalOpen(false); }} />
            {currentView === 'seatmap' && !loading && (
                <div ref={seatmapRef} className="mobile-seatmap-container flex-1 scrollbar-hide bg-[#F2F2F7] relative overflow-auto">
                    <div className="mobile-seatmap-content bg-white shadow-xl">
                        <AttendanceManager isMobileView={true} externalZoneId={selectedZoneId} externalDate={selectedDate} externalSessionId={activeSession} onClose={() => setCurrentView('attendance')} />
                    </div>
                </div>
            )}
            {showSignPad && <SignaturePad teacherName={selectedTeacher?.supervisor_name} onSave={handleSignatureSave} onCancel={() => setShowSignPad(false)} />}
        </div>
    );
};

export default TeacherMobileView;

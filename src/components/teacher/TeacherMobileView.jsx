import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Check, User, PenTool, Search, LogOut, ChevronRight, ChevronLeft, Menu, MapPin, Clock, X, Map as MapIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import AttendanceManager from '../admin/AttendanceManager';
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

    const todayDate = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        fetchInitialData();
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
        if (zoneData && zoneData.length > 0) {
            setZones(zoneData);
            setSelectedZoneId(zoneData[0].id);
        }
        fetchSupervisionData();
    };

    const fetchSupervisionData = async () => {
        const { data, error } = await supabase
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
            
        if (data) {
            setSessions(data);
            const now = format(new Date(), 'HH:mm:ss');
            const current = data.find(s => now >= s.start_time && now <= s.end_time);
            setActiveSession(current ? current.id : data[0]?.id);
        }
    };

    const fetchAttendanceList = async () => {
        setLoading(true);
        const { data: allSeats, error: seatsError } = await supabase
            .from('seats')
            .select('*, zone_color')
            .order('seat_number', { ascending: true });

        if (seatsError) {
            console.error('Error fetching seats:', seatsError);
            setLoading(false);
            return;
        }

        const { data: allDailyBookings, error: bookingsError } = await supabase
            .from('bookings')
            .select(`
                id, seat_id, session_id,
                profiles (full_name, username, grade),
                attendance (id, status, timestamp_in, timestamp_out)
            `)
            .eq('date', selectedDate);
        
        if (allSeats) {
            const formatted = allSeats.map(s => {
                const activeBooking = (allDailyBookings || []).find(b => b.seat_id === s.id && b.session_id === activeSession);
                const isBookedToday = (allDailyBookings || []).some(b => b.seat_id === s.id);
                const attendance = activeBooking?.attendance?.[0];

                return {
                    seat_id: s.id,
                    seat_number: s.seat_number,
                    display_number: s.display_number,
                    zone_name: s.zone_name,
                    zone_color: s.zone_color,
                    booking_id: activeBooking?.id,
                    full_name: activeBooking?.profiles?.full_name,
                    username: activeBooking?.profiles?.username,
                    grade: activeBooking?.profiles?.grade,
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
            id: item.attendance_id,
            booking_id: item.booking_id,
            status: nextStatus,
            updated_at: new Date().toISOString()
        };

        if (!item.timestamp_in) {
            const currentSessionData = sessions.find(s => s.id === activeSession);
            if (currentSessionData) {
                upsertData.timestamp_in = `${todayDate}T${currentSessionData.start_time}+09:00`;
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

        if (!error && updatedRecord) {
            setAttendanceData(prev => prev.map(d => 
                d.booking_id === item.booking_id 
                ? { ...d, status: updatedRecord.status, attendance_id: updatedRecord.id, timestamp_in: updatedRecord.timestamp_in }
                : d
            ));
        } else {
            fetchAttendanceList();
        }
    };

    const resetAttendance = async (item) => {
        if (!item.attendance_id) return;
        
        try {
            const { error } = await supabase
                .from('attendance')
                .delete()
                .eq('id', item.attendance_id);

            if (error) throw error;
            fetchAttendanceList();
        } catch (error) {
            console.error('Error resetting attendance:', error);
        }
    };

    const scrollToZone = (zone) => {
        zoneRefs[zone]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleLogout = () => {
        if (onLogout) onLogout();
    };

    const changeDate = (days) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(format(date, 'yyyy-MM-dd'));
    };

    // NEW: Drag Scroll Logic for Seatmap
    useEffect(() => {
        // Drag-scroll moved to AttendanceManager for better integration with Fabric events
    }, [currentView]);

    const renderHeader = () => {
        // Find current zone name
        const zoneObj = zones.find(z => z.id === selectedZoneId);
        const zoneName = zoneObj?.name || '청람재';
        
        const dateStr = format(new Date(), 'yyyy년 M월 d일');
        const dayStr = ['일','월','화','수','목','금','토'][new Date().getDay()];
        
        let title = `${zoneName} 감독`;
        let subTitle = `(${dateStr}(${dayStr}))`;
        
        if (currentView === 'supervision') {
            title = '감독 서명';
            subTitle = '';
        }
        if (currentView === 'attendance' || currentView === 'seatmap') {
            title = '출결 체크';
            subTitle = '';
        }

        const zoneLetter = zoneObj?.code || 'A';
        const zoneFullName = zoneObj?.name || 'A ZONE';

        const filteredStatsData = attendanceData.filter(item => 
            item.zone_name === zoneFullName || 
            item.zone_name === zoneLetter || 
            (item.seat_number && item.seat_number.startsWith(zoneLetter))
        );

        const presentCount = filteredStatsData.filter(d => d.status === 'present').length;
        const absentCount = filteredStatsData.filter(d => d.is_active && (d.status === 'absent' || !d.status)).length;

        return (
            <header className="flex-none glass-header px-6 pt-10 pb-4 flex flex-col gap-5 z-50">
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <h1 className="text-2xl font-black text-[#1C1C1E] tracking-tight">학습실 감독</h1>
                        <p className="text-[10px] font-black text-ios-indigo tracking-[0.2em] uppercase opacity-70">Study Cafe Manager</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {currentView === 'attendance' && (
                            <button 
                                onClick={() => setCurrentView('seatmap')}
                                className="p-2.5 bg-ios-indigo/10 text-ios-indigo rounded-apple-md ios-tap border border-ios-indigo/10"
                            >
                                <MapIcon className="w-5 h-5" />
                            </button>
                        )}
                        {currentView !== 'menu' ? (
                            <button 
                                onClick={() => setCurrentView(currentView === 'seatmap' ? 'attendance' : 'menu')}
                                className="px-4 py-2.5 bg-gray-200/20 text-ios-gray rounded-apple-md ios-tap border border-white/40 text-[13px] font-black"
                            >
                                {currentView === 'seatmap' ? '뒤로' : '메뉴'}
                            </button>
                        ) : (
                            <button onClick={handleLogout} className="p-2.5 bg-ios-rose/10 text-ios-rose rounded-apple-md ios-tap border border-ios-rose/10">
                                <LogOut className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {(currentView === 'attendance' || currentView === 'seatmap' || currentView === 'supervision') && (
                    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-top-4 duration-300">
                        {/* Zone Selection & Date Navigation */}
                        <div className="flex gap-2 items-stretch">
                            <div className="flex-1 bg-gray-200/20 p-1 rounded-apple-md border border-white/40 flex items-center justify-center min-h-[38px] backdrop-blur-xl">
                                <span className="text-[12px] font-black text-[#1C1C1E] px-2">
                                    {zoneName}
                                </span>
                            </div>

                            <div className="flex-[2] flex items-center justify-between bg-gray-200/20 px-2 rounded-apple-md border border-white/40 backdrop-blur-xl min-h-[38px]">
                                <button 
                                    onClick={() => changeDate(-1)}
                                    className="w-8 h-8 flex items-center justify-center text-ios-gray ios-tap"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-[11px] font-black text-[#1C1C1E]">
                                    {selectedDate.substring(5)} ({['일','월','화','수','목','금','토'][new Date(selectedDate).getDay()]})
                                </span>
                                <button 
                                    onClick={() => changeDate(1)}
                                    className="w-8 h-8 flex items-center justify-center text-ios-gray ios-tap"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Attendance-specific controls */}
                        {(currentView === 'attendance' || currentView === 'seatmap') && (
                            <>
                                <div className="flex bg-gray-200/20 p-1 rounded-apple-md border border-white/40 overflow-x-auto scrollbar-hide">
                                    {sessions.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setActiveSession(s.id)}
                                            className={`flex-1 px-3 py-2.5 rounded-apple-md text-xs font-black whitespace-nowrap transition-all ios-tap ${
                                                activeSession === s.id ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-ios-gray'
                                            }`}
                                        >
                                            {s.name}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-3 h-20">
                                    <div className="flex-1 bg-white shadow-sm border border-gray-100 rounded-apple p-3 flex flex-col justify-center items-center font-black">
                                        <span className="text-[10px] text-ios-blue uppercase tracking-wider mb-1">현재 출석</span>
                                        <span className="text-2xl text-[#1C1C1E]">{presentCount}명</span>
                                    </div>
                                    <div className="flex-1 bg-white shadow-sm border border-gray-100 rounded-apple p-3 flex flex-col justify-center items-center font-black">
                                        <span className="text-[10px] text-ios-rose uppercase tracking-wider mb-1">미입실/결석</span>
                                        <span className="text-2xl text-[#1C1C1E]">{absentCount}명</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </header>
        );
    };

    const renderMenuView = () => (
        <div className="mobile-menu-container">
            <div className="mobile-menu-grid">
                <button 
                    onClick={() => setCurrentView('supervision')}
                    className="mobile-menu-btn"
                >
                    <div className="mobile-menu-btn-icon bg-blue-50">
                        <PenTool className="w-8 h-8 text-[#007AFF]" />
                    </div>
                    <span className="mobile-menu-btn-text">감독 서명</span>
                </button>
                <button 
                    onClick={() => setCurrentView('attendance')}
                    className="mobile-menu-btn"
                >
                    <div className="mobile-menu-btn-icon bg-rose-50">
                        <Check className="w-8 h-8 text-[#FF3B30]" />
                    </div>
                    <span className="mobile-menu-btn-text">출결 체크</span>
                </button>
            </div>
            {todayDate && (
                <div className="text-center">
                    <p className="text-sm font-bold text-gray-400">오늘은 {format(new Date(), 'yyyy년 M월 d일')} 입니다.</p>
                </div>
            )}
        </div>
    );

    const renderSupervisionView = () => {
        const now = new Date();
        const currentTime = format(now, 'HH:mm:ss');
        const lastSessionEnd = sessions.length > 0 
            ? sessions.reduce((max, s) => s.end_time > max ? s.end_time : max, '00:00:00')
            : '23:59:59';
        
        const todayStr = format(now, 'yyyy-MM-dd');
        const isPastDate = selectedDate < todayStr;
        const isToday = selectedDate === todayStr;
        const isExpired = currentUser?.role !== 'admin' && (isPastDate || (isToday && currentTime > lastSessionEnd));

        return (
            <main className="flex-1 flex flex-col h-full overflow-hidden" style={{ padding: '0 1rem 1rem 1rem' }}>
                <div className="flex-1 flex flex-col gap-4 h-full overflow-y-auto pb-6 pt-2">
                    {todayAssignments.map((assign, index) => (
                        <div 
                            key={assign.id} 
                            className="flex-1 min-h-[300px] bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm flex flex-col items-center justify-center"
                        >
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
                                    isExpired ? (
                                        <div className="w-full py-5 bg-gray-50 text-gray-400 rounded-2xl text-center border border-gray-100">
                                            <p className="text-sm font-bold">감독 시간이 종료되어 서명할 수 없습니다.</p>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => { setSelectedTeacher(assign); setShowSignPad(true); }}
                                            className="w-full py-5 bg-[#007AFF] text-white rounded-2xl text-base font-black mobile-tap-feedback shadow-lg shadow-blue-100"
                                        >
                                            서명하기
                                        </button>
                                    )
                                )}
                            {assign.signature_url && (
                                <div className="w-full bg-gray-50 rounded-2xl p-4 flex items-center justify-center border border-dashed border-gray-200 min-h-[100px]">
                                    <img src={assign.signature_url} alt="Signature" className="max-h-16 opacity-60 object-contain" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                
                {/* 1명만 감독할 경우 레이아웃 유지를 위해 dummy 추가 */}
                {todayAssignments.length === 1 && (
                    <div className="flex-1 min-h-0 p-6 border border-transparent opacity-0 pointer-events-none" />
                )}

                {todayAssignments.length === 0 && (
                    <div className="flex-1 bg-white rounded-[32px] border border-dashed border-gray-200 text-gray-400 text-center flex items-center justify-center p-6">
                        <p className="text-base font-bold">오늘 배정된 감독 교사가 없습니다.</p>
                    </div>
                )}
            </div>
        </main>
        );
    };

    const renderAttendanceView = () => (
        <main className="mobile-attendance-list">
                <div className="mobile-zone-grid">
                    {['A', 'B', 'C'].map(zoneLetter => {
                        const zoneFullName = `${zoneLetter} zone`;
                        const zoneSeats = attendanceData.filter(item => 
                            item.zone_name === zoneFullName || 
                            item.zone_name === zoneLetter || 
                            (item.seat_number && item.seat_number.startsWith(zoneLetter))
                        );
                        const fallbackColor = zoneLetter === 'A' ? '#34C759' : zoneLetter === 'B' ? '#FF9500' : '#FF3B30';

                        return (
                            <div key={zoneLetter} className="zone-column" ref={zoneRefs[zoneLetter]}>
                                <div className="zone-title-bar" style={{ backgroundColor: zoneSeats[0]?.zone_color || fallbackColor }}>
                                    {zoneLetter} ZONE
                                </div>
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
                                                        <>
                                                            <span className="grid-card-student">{item.full_name}</span>
                                                            <span className="grid-card-id">{item.username || '학번 없음'}</span>
                                                        </>
                                                    ) : (
                                                        <span className="grid-card-info text-gray-300">공석</span>
                                                    )}
                                                </div>
                                                <div className="grid-card-footer">
                                                    {item.full_name ? (
                                                        item.status === 'absent' ? (
                                                            <>
                                                                <div className="grid-status-btn status-absent-btn">미출석</div>
                                                                <button 
                                                                    className="grid-action-btn"
                                                                    onClick={() => toggleAttendance(item)}
                                                                    style={{ backgroundColor: headerColor }}
                                                                >
                                                                    출석처리
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                    <div 
                                                                        className={`grid-status-btn ${
                                                                            item.status === 'present' ? 'status-present-active' :
                                                                            item.status === 'late' ? 'status-late-active' :
                                                                            'status-early-active'
                                                                        }`}
                                                                        style={{ backgroundColor: item.status === 'present' ? headerColor : undefined }}
                                                                    >
                                                                        {(() => {
                                                                            const session = sessions.find(s => s.id === activeSession);
                                                                            const now = format(new Date(), 'HH:mm:ss');
                                                                            return item.status === 'present' ? (session && now > session.end_time ? '학습종료' : '학습중') : item.status === 'late' ? '지각' : '조퇴';
                                                                        })()}
                                                                    </div>
                                                                <button 
                                                                    className="grid-action-btn subtle" 
                                                                    onClick={() => resetAttendance(item)}
                                                                >
                                                                    결석처리
                                                                </button>
                                                            </>
                                                        )
                                                    ) : (
                                                        <div className="grid-status-btn status-absent-btn opacity-20">-</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {attendanceData.length === 0 && !loading && (
                    <div className="text-center py-12">
                        <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-xs text-gray-300 font-bold">진행 중인 세션이 없습니다.</p>
                    </div>
                )}
        </main>
    );

    return (
        <div className="mobile-dashboard-container h-[100dvh] overflow-hidden flex flex-col">
            {renderHeader()}
            
            {loading && <div className="flex-1 flex items-center justify-center"><p className="text-sm font-bold text-gray-400">로딩 중...</p></div>}
            
            {!loading && currentView === 'menu' && renderMenuView()}
            {!loading && currentView === 'supervision' && renderSupervisionView()}
            {!loading && currentView === 'attendance' && renderAttendanceView()}
            {!loading && currentView === 'seatmap' && (
                <div 
                    ref={seatmapRef} 
                    className="mobile-seatmap-container flex-1 scrollbar-hide bg-[#F2F2F7] relative overflow-auto"
                >
                    <div className="mobile-seatmap-content bg-white shadow-xl">
                        <AttendanceManager 
                            isMobileView={true} 
                            externalZoneId={selectedZoneId}
                            externalDate={selectedDate}
                            externalSessionId={activeSession}
                        />
                    </div>
                </div>
            )}

            {showSignPad && (
                <SignaturePad 
                    teacherName={selectedTeacher?.supervisor_name}
                    onSave={handleSignatureSave}
                    onCancel={() => setShowSignPad(false)}
                />
            )}
        </div>
    );
};

export default TeacherMobileView;

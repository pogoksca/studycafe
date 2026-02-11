import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Home, Map, List, MapPin, User, LogOut, Layout,
  ChevronRight, ChevronLeft, Calendar, CheckCircle2, BookOpen, Clock, X
} from 'lucide-react';
import StudentBookingMobileWizard from './StudentBookingMobileWizard';
import AttendanceCheck from '../booking/AttendanceCheck';
import UserProfile from '../profile/UserProfile';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, addWeeks, subWeeks, isSameDay, parse } from 'date-fns';
import { ko } from 'date-fns/locale';

const StudentMobileView = ({ onLogout, currentUser }) => {
  const [activeTab, setActiveTab] = useState('home'); // home, map, attendance, profile
  const [currentSession, setCurrentSession] = useState(null);
  const [nextSession, setNextSession] = useState(null);
  const [schoolName, setSchoolName] = useState('');
  const [todayStudyPlan, setTodayStudyPlan] = useState('');
  const [weeklyData, setWeeklyData] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [manageDate, setManageDate] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [attendanceStatus, setAttendanceStatus] = useState(null); // { status, timestamp_in, timestamp_out }
  
  const fetchDashboardData = React.useCallback(async () => {
    if (!currentUser) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    
    // 1. Fetch Today's Study Plan
    const { data: plans } = await supabase
        .from('study_plans')
        .select('content')
        .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
        .eq('date', todayStr);
        
    if (plans && plans.length > 0) {
        setTodayStudyPlan(plans.map(p => p.content).filter(Boolean).join('\n'));
    } else {
        setTodayStudyPlan('');
    }

    // 2. Weekly Bookings
    const { data: bookings } = await supabase
        .from('bookings')
        .select(`
            *,
            sessions (id, name, start_time, end_time),
            seats (id, seat_number, zone_name, zone_id, zones(name)),
            attendance (id, booking_id, status, timestamp_in, timestamp_out)
        `)
        .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));
        
    if (bookings) {
        const dataMap = {};
        bookings.forEach(b => {
            const d = b.date;
            if (!dataMap[d]) dataMap[d] = { bookings: [], attendance: [] };
            dataMap[d].bookings.push(b);
            
            // Handle array or object
            const atts = Array.isArray(b.attendance) ? b.attendance : (b.attendance ? [b.attendance] : []);
            if (atts.length > 0) {
                dataMap[d].attendance.push(...atts);
            }
        });
        setWeeklyData(dataMap);
    }

    // 3. Exceptions
    const { data: exData } = await supabase
        .from('operation_exceptions')
        .select('*')
        .gte('exception_date', format(start, 'yyyy-MM-dd'))
        .lte('exception_date', format(end, 'yyyy-MM-dd'));
    setExceptions(exData || []);
  }, [currentUser, currentDate]);

  const fetchSession = React.useCallback(async () => {
    const { data: sessions } = await supabase.from('sessions').select('*').order('start_time', { ascending: true });
    if (sessions) {
      const now = new Date();
      const currentTime = format(now, 'HH:mm:00');
      const active = sessions.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
      const next = sessions.find(s => s.start_time > currentTime);
      setCurrentSession(active);
      setNextSession(next);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchSchoolInfo = async () => {
        const { data } = await supabase.from('configs').select('value').eq('key', 'school_info').single();
        if (data?.value?.name_en) setSchoolName(data.value.name_en);
    };

    fetchSession();
    fetchSchoolInfo();
    fetchDashboardData();

    const interval = setInterval(() => {
        fetchSession();
        fetchDashboardData();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchSession, fetchDashboardData]);

  // Separate Effect to sync Attendance Status
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayData = weeklyData[todayStr];
    if (!todayData) {
        setAttendanceStatus(null);
        return;
    }

    const todayBookings = todayData.bookings || [];
    const todayAttendance = todayData.attendance || [];
    
    if (currentSession) {
        const currentBooking = todayBookings.find(b => b.session_id === currentSession.id);
        const att = todayAttendance.find(a => a.booking_id === currentBooking?.id);
        setAttendanceStatus(att || null);
    } else if (nextSession) {
        const nextBooking = todayBookings.find(b => b.session_id === nextSession.id);
        const att = todayAttendance.find(a => a.booking_id === nextBooking?.id);
        setAttendanceStatus(att || null);
    } else {
        setAttendanceStatus(null);
    }
  }, [weeklyData, currentSession, nextSession]);

  useEffect(() => {
    const interval = setInterval(() => {
        const fetchSess = async () => {
             const { data: sessions } = await supabase.from('sessions').select('*').order('start_time', { ascending: true });
             if (sessions) {
               const now = new Date();
               const currentTime = format(now, 'HH:mm:00');
               const active = sessions.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
               const next = sessions.find(s => s.start_time > currentTime);
               setCurrentSession(active);
               setNextSession(next);
             }
        };
        fetchSess();
    }, 60000); 
    return () => clearInterval(interval);
  }, []);

  const handlePrevWeek = () => setCurrentDate(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setCurrentDate(prev => addWeeks(prev, 1));

  const getDayStatus = (dateStr, dayData) => {
    if (!dayData || !dayData.bookings.length) return null;

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const { bookings, attendance } = dayData;

    // 1. Future
    if (dateStr > todayStr) return { label: '예약', color: 'text-ios-indigo bg-ios-indigo/10' };

    // 2. Past
    if (dateStr < todayStr) {
        if (!attendance.length) return { label: '결석', color: 'text-ios-rose bg-ios-rose/10' };
        
        const totalSessions = bookings.length;
        const attendedCount = attendance.filter(a => a.status === 'present' || a.status === 'early_leave').length;

        if (attendedCount === totalSessions) {
            return { label: '이수', color: 'text-ios-emerald bg-ios-emerald/10' };
        } else if (attendedCount > 0) {
            return { label: '일부이수', color: 'text-ios-blue bg-ios-blue/10' };
        }
        
        const hasLate = attendance.some(a => a.status === 'late');
        if (hasLate) return { label: '지각', color: 'text-ios-amber bg-ios-amber/10' };
        
        return { label: '결석', color: 'text-ios-rose bg-ios-rose/10' };
    }

    // 3. Today
    const currentTime = format(now, 'HH:mm:ss');
    // Sort bookings by time
    const sortedBookings = [...bookings].sort((a,b) => 
        (a.sessions?.start_time || '').localeCompare(b.sessions?.start_time || '')
    );
    
    if (!sortedBookings.length) return null;

    const firstStart = sortedBookings[0].sessions?.start_time;
    const lastEnd = sortedBookings[sortedBookings.length - 1].sessions?.end_time;

    // Has checked out? (Attendance with timestamp_out or user manually left logic - simplistic here)
    const hasEveningBooking = bookings.some(b => (b.sessions?.start_time || '') >= '17:00:00');
    const isClassWindow = currentTime >= '09:00:00' && currentTime <= '17:00:00';

    // During session range
    const activeSession = sortedBookings.find(b => {
        const s = b.sessions;
        return s && currentTime >= s.start_time && currentTime <= s.end_time;
    });

    if (activeSession) {
        // Check if checked in
        const att = attendance.find(a => a.booking_id === activeSession.id);
        if (att) return { label: '학습중', color: 'text-white bg-ios-emerald' }; // Active study
        return { label: '미입실', color: 'text-ios-rose bg-ios-rose/10' }; // Late/Not checked in
    }

    if (isClassWindow && hasEveningBooking) return { label: '수업', color: 'text-gray-400 bg-gray-100' };
    if (lastEnd && currentTime > lastEnd) return { label: '퇴실', color: 'text-gray-500 bg-gray-100' };
    if (firstStart && currentTime < firstStart) return { label: '예약', color: 'text-ios-indigo bg-ios-indigo/10' };

    // In between sessions
    return { label: '휴식', color: 'text-ios-amber bg-ios-amber/10' };
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="h-full flex flex-col gap-4 p-4 animate-fade-in relative overflow-hidden">
             {/* Background Decoration */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-ios-indigo/5 blur-3xl -z-10" />
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-ios-blue/5 blur-3xl -z-10" />

             {/* 0. Today's Learning Dashboard */}
             <div className="flex-[2] glass-card p-7 relative overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-ios-amber/10 flex items-center justify-center">
                             <BookOpen className="w-4 h-4 text-ios-amber" />
                        </div>
                        <h2 className="text-lg font-black text-[#1C1C1E] tracking-tight">오늘의 학습</h2>
                    </div>
                    <span className="text-[10px] font-bold text-ios-gray bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100 max-sm:hidden">
                        {format(new Date(), 'M월 d일')} 현황
                    </span>
                </div>
                
                <div className="flex-1 flex items-center justify-center text-center">
                    {todayStudyPlan ? (
                        <p className="text-[15px] text-[#1C1C1E] font-bold leading-relaxed whitespace-pre-line line-clamp-3">
                            {todayStudyPlan}
                        </p>
                    ) : (
                         <div className="text-center">
                             <p className="text-sm text-gray-400 font-bold leading-relaxed mb-1">
                                오늘 등록된 학습 목표가 없습니다.
                            </p>
                            <span className="text-xs font-medium text-gray-300">예약 시 목표를 설정해보세요.</span>
                        </div>
                    )}
                </div>

                {/* Weekly Status */}
                <div className="mt-auto flex items-center justify-center gap-1">
                    {/* Previous Week Button */}
                    <button 
                        onClick={handlePrevWeek}
                        className="w-6 h-6 flex items-center justify-center text-ios-gray hover:text-[#1C1C1E] transition-colors ios-tap shrink-0"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex-1 bg-gray-200/20 rounded-apple-md px-2 py-3 border border-white/40 relative backdrop-blur-xl">
                        <div className="flex justify-between items-center px-0">
                            {eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }).map((day, i) => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const dayData = weeklyData[dateStr];
                                const status = getDayStatus(dateStr, dayData);
                                const isCur = isSameDay(day, new Date()); // Check against real today
                                
                                let bgClass = isCur 
                                    ? (status 
                                        ? 'bg-ios-indigo text-white shadow-lg ring-4 ring-white z-10' 
                                        : 'bg-white/50 border border-white/40 text-[#1C1C1E]') 
                                    : 'bg-white/50 border border-white/40 text-gray-300';
                                
                                if (status?.label === '이수' || status?.label === '학습중' || status?.label === '출석') {
                                    bgClass = 'bg-ios-emerald text-white shadow-sm border-none';
                                } else if (status?.label === '일부이수') {
                                    bgClass = 'bg-ios-blue text-white shadow-sm border-none';
                                } else if (status?.label === '지각') {
                                    bgClass = 'bg-ios-amber text-white shadow-sm border-none';
                                } else if (status?.label === '결석' || status?.label === '미입실') {
                                    bgClass = 'bg-ios-rose text-white shadow-sm border-none';
                                } else if (status?.label === '예약') {
                                    bgClass = 'bg-ios-indigo text-white shadow-sm border-none';
                                }

                                const isWeekend = i === 5 || i === 6; // Sat, Sun (i is 0-indexed from Mon)
                                const isHoliday = exceptions.some(ex => ex.date === dateStr);
                                
                                let labelColor = 'text-gray-300';
                                if (isCur) labelColor = 'text-ios-indigo';
                                else if (isHoliday || isWeekend) labelColor = 'text-ios-rose/40';
                                else if (dayData && dayData.bookings.length > 0) labelColor = 'text-ios-indigo';

                                return (
                                    <div 
                                        key={i} 
                                        className={`flex flex-col items-center gap-1.5 ${dayData ? 'cursor-pointer' : ''}`}
                                        onClick={() => dayData && setManageDate(day)}
                                    >
                                        <span className={`text-[8px] font-black ${labelColor}`}>
                                            {['월','화','수','목','금','토','일'][i]}
                                        </span>
                                        <div className={`w-6 h-6 rounded-ios flex items-center justify-center text-[9px] font-black transition-all ios-tap ${bgClass}`}>
                                            {format(day, 'd')}
                                        </div>
                                        <div className="h-3 flex items-center justify-center">
                                            {status ? (
                                                <span className={`text-[7px] font-bold px-1 py-0.5 rounded-full whitespace-nowrap ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            ) : isCur ? (
                                                <span className="text-[7px] font-black text-ios-indigo">오늘</span>
                                            ) : (
                                                <div className="w-0.5 h-0.5 rounded-full bg-transparent" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Next Week Button */}
                    <button 
                        onClick={handleNextWeek}
                        className="w-6 h-6 flex items-center justify-center text-ios-gray hover:text-[#1C1C1E] transition-colors ios-tap shrink-0"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
             </div>

             {/* 1. Booking Button */}
             <button 
               onClick={() => setActiveTab('map')}
               className="flex-1 bg-white rounded-apple border border-gray-100 shadow-sm p-4 flex items-center justify-center gap-6 group transition-all active:scale-[0.98] relative overflow-hidden ios-tap"
             >
               <div className="absolute inset-0 bg-gradient-to-br from-ios-indigo/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
               <div className="w-14 h-14 rounded-full bg-ios-indigo/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                 <Map className="w-7 h-7 text-ios-indigo" />
               </div>
               <div className="text-left space-y-1 relative z-10 flex-1">
                 <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight">예약하기</h2>
                 <p className="text-xs font-bold text-ios-gray">새로운 예약 및 기존 예약 수정시 선택하세요</p>
               </div>
               <ChevronRight className="w-5 h-5 text-gray-300" />
             </button>

             {/* 2. Attendance/Early Leave Button */}
             {(() => {
                 const now = new Date();
                 const isWithin10MinOfNext = nextSession && (() => {
                    const todayStr = format(now, 'yyyy-MM-dd');
                    const nextStart = parse(`${todayStr} ${nextSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
                    const diff = (nextStart.getTime() - now.getTime()) / (1000 * 60);
                    return diff >= 0 && diff <= 10;
                 })();
                 
                 const isCheckedIn = (currentSession && attendanceStatus?.timestamp_in);
                 const label = isCheckedIn ? '조퇴신청' : '출석인증';
                 const subLabel = isCheckedIn ? '지금 바로 퇴실 처리' : (isWithin10MinOfNext ? '지금 바로 출석 인증' : '인증 가능 세션 확인');
                 const themeColor = isCheckedIn ? 'text-ios-rose bg-ios-rose/10' : 'text-ios-indigo bg-ios-indigo/10';
                 const Icon = isCheckedIn ? LogOut : CheckCircle2;

                 return (
                    <button 
                        onClick={() => setActiveTab('attendance')}
                        className="flex-1 bg-white rounded-apple border border-gray-100 shadow-sm p-4 flex items-center justify-between active:scale-[0.98] transition-all ios-tap mb-4"
                    >
                        <div className="flex items-center gap-6">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${themeColor}`}>
                                <Icon className="w-7 h-7" />
                            </div>
                            <div className="text-left space-y-1">
                                <h3 className="text-xl font-black text-[#1C1C1E] tracking-tight">{label}</h3>
                                <p className="text-xs font-bold text-gray-400">{subLabel}</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300" />
                    </button>
                 );
               })()}

          </div>
        );
      case 'map':
        return (
            <div className="flex-1 bg-white relative overflow-hidden flex flex-col">
                <StudentBookingMobileWizard 
                    onCancel={() => setActiveTab('home')}
                    onSuccess={() => setActiveTab('profile')} // Go to My Page on success
                    currentUser={currentUser}
                />
            </div>
        );
      case 'attendance':
        const now = new Date();
        const isWithin10MinOfNext = nextSession && (() => {
            const todayStr = format(now, 'yyyy-MM-dd');
            const nextStart = parse(`${todayStr} ${nextSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
            const diff = (nextStart.getTime() - now.getTime()) / (1000 * 60);
            return diff >= 0 && diff <= 10;
        })();

        // Prop for AttendanceCheck: It should know if it's generally in an "early leave allowed" state
        // Re-restricted to 10 minutes before session as per latest user request
        const isEarlyLeaveAllowed = (currentSession && attendanceStatus?.timestamp_in) || (!currentSession && isWithin10MinOfNext);
        
        return (
            <div className="flex-1 bg-white flex flex-col items-center justify-center overflow-y-auto scrollbar-hide px-6">
                <div className="w-full max-w-lg py-8 flex flex-col items-center justify-center">
                    <AttendanceCheck 
                        user={currentUser} 
                        isEarlyLeaveMode={isEarlyLeaveAllowed}
                        onSuccess={() => {
                            fetchDashboardData();
                            setActiveTab('home');
                        }}
                    />
                </div>
            </div>
        );
      case 'profile':
        return (
            <div className="flex-1 bg-[#F2F2F7] overflow-y-auto scrollbar-hide p-6">
                <UserProfile user={currentUser} />
            </div>
        );
      default:
        return null;
    }
  };

  const renderDayDetailModal = () => {
    if (!manageDate) return null;
    
    const dateStr = format(manageDate, 'yyyy-MM-dd');
    const dayData = weeklyData[dateStr];
    const bookingsForDate = dayData?.bookings || [];

    // Sort bookings by start time
    const sortedBookings = [...bookingsForDate].sort((a, b) => 
        (a.sessions?.start_time || '').localeCompare(b.sessions?.start_time || '')
    );

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative animate-spring-up">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black text-[#1C1C1E]">
                            {format(manageDate, 'M월 d일')} 예약 상세
                        </h3>
                        <button 
                            onClick={() => setManageDate(null)} 
                            className="p-2 -mr-2 text-gray-400 hover:text-black ios-tap"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-4 max-h-[50vh] overflow-y-auto scrollbar-hide">
                        {sortedBookings.length > 0 ? sortedBookings.map((b, i) => {
                            const now = new Date();
                            const isToday = dateStr === format(now, 'yyyy-MM-dd');
                            const currentTime = format(now, 'HH:mm:ss');
                            const sessionEndTime = b.sessions?.end_time;

                            const att = b.attendance?.[0];
                            const isPastSession = isToday && sessionEndTime && currentTime > sessionEndTime;

                            const statusLabel = att 
                                ? (att.status === 'present' ? '출석' : att.status === 'late' ? '지각' : '결석')
                                : (isPastSession ? '결석' : '대기');

                            const statusColor = att
                                ? (att.status === 'present' ? 'text-ios-emerald bg-ios-emerald/10' : att.status === 'late' ? 'text-ios-amber bg-ios-amber/10' : 'text-ios-rose bg-ios-rose/10')
                                : (isPastSession ? 'text-ios-rose bg-ios-rose/10' : 'text-gray-400 bg-gray-50');

                            return (
                                <div key={i} className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between border border-gray-100">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-black text-[#1C1C1E]">
                                                {b.sessions?.name}
                                            </p>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColor}`}>
                                                {statusLabel}
                                            </span>
                                        </div>
                                        <p className="text-xs text-ios-gray font-bold">
                                            <Clock className="w-3 h-3 inline-block mr-1 mb-0.5" />
                                            {b.sessions?.start_time.slice(0,5)} ~ {b.sessions?.end_time.slice(0,5)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-ios-indigo/60 mb-0.5">
                                            {b.seats?.zones?.name || ''}
                                        </p>
                                        <p className="text-xs font-black text-ios-indigo">
                                            {b.seats?.zone_name ? `${b.seats.zone_name}-` : ''}{b.seat_number || b.seats?.seat_number || '-'} 좌석
                                        </p>
                                        {att?.timestamp_in && (
                                            <p className="text-[10px] text-ios-gray font-bold mt-1">
                                                입실: {format(new Date(att.timestamp_in), 'HH:mm')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="py-12 text-center space-y-2">
                                <Calendar className="w-10 h-10 text-gray-200 mx-auto" />
                                <p className="text-sm font-bold text-gray-400">등록된 예약 정보가 없습니다.</p>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setManageDate(null)}
                        className="w-full py-4 bg-[#1C1C1E] text-white rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="mobile-container flex flex-col bg-[#F2F2F7] h-[100dvh] overflow-hidden font-sans pb-[safe-area-inset-bottom]">
      {/* Header */}
      <header className="flex-none glass-header px-6 pt-4 pb-4 flex items-center justify-between shadow-sm z-50">
        <div className="flex flex-col">
            <h1 className="text-2xl font-black text-[#1C1C1E] tracking-tight">{schoolName.split(' ')[0]}</h1>
            <p className="text-[10px] font-black text-ios-indigo tracking-[0.2em] uppercase opacity-70">Study Cafe Manager</p>
        </div>

        <div className="flex items-center gap-4">
            <button 
              onClick={onLogout}
              className="p-3 bg-gray-200/20 text-ios-gray hover:text-ios-rose hover:bg-ios-rose/10 rounded-apple-md transition-all ios-tap border border-white/40 backdrop-blur-xl"
            >
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
          {renderContent()}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex-none glass-material pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))] pt-2 px-6 flex justify-between items-center z-50 shadow-[0_-4px_40px_rgba(0,0,0,0.03)] border-t border-white/40">
        {[
          { id: 'home', icon: Home, label: '홈' },
          { id: 'map', icon: Map, label: '예약' },
          { id: 'attendance', icon: MapPin, label: '출석' },
          { id: 'profile', icon: User, label: 'MY' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center p-2 rounded-apple-md transition-all duration-300 w-16 group ios-tap ${
              activeTab === item.id 
                ? 'text-[#1C1C1E]' 
                : 'text-gray-300 hover:text-gray-500'
            }`}
          >
            <div className={`relative transition-transform duration-300`}>
                <item.icon className={`w-7 h-7 stroke-[2.5px] ${activeTab === item.id ? 'fill-ios-indigo/10' : 'fill-transparent'}`} />
            </div>
            <span className="text-[9px] font-black mt-1">{item.label}</span>
          </button>
        ))}
      </nav>
      {renderDayDetailModal()}
    </div>
  );
};

export default StudentMobileView;

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Home, Map, List, MapPin, User, LogOut, Layout,
  ChevronRight, ChevronLeft, Calendar, CheckCircle2, BookOpen, Clock, X
} from 'lucide-react';
import StudentBookingMobileWizard from './StudentBookingMobileWizard';
import AttendanceCheck from '../booking/AttendanceCheck';
import UserProfile from '../profile/UserProfile';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';

const StudentMobileView = ({ onLogout, currentUser }) => {
  const [activeTab, setActiveTab] = useState('home'); // home, map, attendance, profile
  const [currentSession, setCurrentSession] = useState(null);
  const [schoolName, setSchoolName] = useState(''); // Default name
  const [todayStudyPlan, setTodayStudyPlan] = useState('');
  const [weeklyData, setWeeklyData] = useState({}); // { 'yyyy-MM-dd': { bookings: [], attendance: [] } }
  const [currentDate, setCurrentDate] = useState(new Date()); // For calendar navigation
  const [manageDate, setManageDate] = useState(null); // For detail modal
  
  // Fetch current session for header info
  useEffect(() => {
    const fetchSession = async () => {
      const { data: sessions } = await supabase.from('sessions').select('*');
      if (sessions) {
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                           now.getMinutes().toString().padStart(2, '0') + ':00';
        const active = sessions.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
        setCurrentSession(active);
      }
    };

    const fetchSchoolInfo = async () => {
        const { data } = await supabase
            .from('configs')
            .select('value')
            .eq('key', 'school_info')
            .single();
        
        if (data?.value?.name_en) {
            setSchoolName(data.value.name_en);
        }
    };

    const fetchDashboardData = async () => {
        if (!currentUser) return;
        const todayStr = format(new Date(), 'yyyy-MM-dd'); // Always real today for study plan
        
        // For Dashboard Calendar: Use currentDate
        const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        
        // 1. Fetch Today's Study Plan (Actual Today)
        const { data: plans } = await supabase
            .from('study_plans')
            .select('content')
            .eq('user_id', currentUser.id)
            .eq('date', todayStr);
            
        if (plans && plans.length > 0) {
            const combined = plans.map(p => p.content).filter(Boolean).join('\n');
            setTodayStudyPlan(combined);
        } else {
            setTodayStudyPlan('');
        }

        // 2. Fetch Weekly Bookings with Session and Attendance
        const { data: bookings } = await supabase
            .from('bookings')
            .select(`
                *,
                sessions (
                    id,
                    name,
                    start_time,
                    end_time
                ),
                seats (id, seat_number, zone_name, zone_id, zones(name)),
                attendance (
                    id,
                    booking_id,
                    status,
                    timestamp_in,
                    timestamp_out
                )
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
                if (b.attendance && b.attendance.length > 0) {
                    dataMap[d].attendance.push(...b.attendance);
                }
            });
            setWeeklyData(dataMap);
        }
    };

    fetchSession();
    fetchSchoolInfo();
    fetchDashboardData();
    const interval = setInterval(() => {
        fetchSession();
        fetchDashboardData(); // Refresh dashboard periodically
    }, 60000); 
    return () => clearInterval(interval);
  }, [currentUser, currentDate]); // Refresh when user or date changes

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
        const isLate = attendance.some(a => a.status === 'late');
        if (isLate) return { label: '지각', color: 'text-ios-amber bg-ios-amber/10' };
        return { label: '이수', color: 'text-ios-emerald bg-ios-emerald/10' };
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
          <div className="flex-1 flex flex-col gap-4 p-4 animate-fade-in relative overflow-y-auto scrollbar-hide">
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
                <div className="bg-gray-200/20 rounded-apple-md p-4 border border-white/40 mt-auto relative backdrop-blur-xl">
                    {/* Navigation Arrows */}
                    <button 
                        onClick={handlePrevWeek}
                        className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ios-gray hover:text-[#1C1C1E] transition-colors ios-tap"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handleNextWeek}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ios-gray hover:text-[#1C1C1E] transition-colors ios-tap"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>

                    <div className="flex justify-between items-center px-6">
                        {eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }).map((day, i) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const dayData = weeklyData[dateStr];
                            const status = getDayStatus(dateStr, dayData);
                            const isCur = isSameDay(day, new Date()); // Check against real today
                            
                            let bgClass = isCur 
                                ? 'bg-[#1C1C1E] text-white shadow-lg ring-4 ring-white z-10' 
                                : 'bg-white/50 border border-white/40 text-gray-300';
                            
                            if (status?.label === '이수' || status?.label === '학습중' || status?.label === '출석') {
                                bgClass = 'bg-ios-emerald text-white shadow-sm border-none';
                            } else if (status?.label === '지각') {
                                bgClass = 'bg-ios-amber text-white shadow-sm border-none';
                            } else if (status?.label === '결석' || status?.label === '미입실') {
                                bgClass = 'bg-ios-rose text-white shadow-sm border-none';
                            } else if (status?.label === '예약') {
                                bgClass = 'bg-ios-indigo text-white shadow-sm border-none';
                            }

                            return (
                                <div 
                                    key={i} 
                                    className={`flex flex-col items-center gap-2 ${dayData ? 'cursor-pointer' : ''}`}
                                    onClick={() => dayData && setManageDate(day)}
                                >
                                    <span className={`text-[9px] font-black ${isCur ? 'text-[#1C1C1E]' : 'text-gray-300'}`}>
                                        {['월','화','수','목','금','토','일'][i]}
                                    </span>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all ios-tap ${bgClass}`}>
                                        {format(day, 'd')}
                                    </div>
                                    <div className="h-4 flex items-center justify-center">
                                        {status ? (
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${status.color}`}>
                                                {status.label}
                                            </span>
                                        ) : (
                                            <div className="w-1 h-1 rounded-full bg-transparent" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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
                 <p className="text-xs font-bold text-ios-gray">원하는 좌석을 선택하세요</p>
               </div>
               <ChevronRight className="w-5 h-5 text-gray-300" />
             </button>

            {/* 2. Attendance Button */}
             <button 
               onClick={() => setActiveTab('attendance')}
               className="flex-1 bg-white rounded-apple border border-gray-100 shadow-sm p-4 flex items-center justify-center gap-6 group transition-all active:scale-[0.98] relative overflow-hidden ios-tap"
             >
               <div className="absolute inset-0 bg-gradient-to-br from-ios-emerald/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
               <div className="w-14 h-14 rounded-full bg-ios-emerald/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                 <MapPin className="w-7 h-7 text-ios-emerald" />
               </div>
               <div className="text-left space-y-1 relative z-10 flex-1">
                 <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight">출석인증</h2>
                 <p className="text-xs font-bold text-ios-gray">GPS로 간편하게 인증하세요</p>
               </div>
               <ChevronRight className="w-5 h-5 text-gray-300" />
             </button>

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
        return (
            <div className="flex-1 bg-white flex flex-col items-center justify-center overflow-y-auto scrollbar-hide px-6">
                <div className="w-full max-w-lg py-8 flex flex-col items-center justify-center">
                    <AttendanceCheck user={currentUser} />
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
                            const att = b.attendance?.[0];
                            const statusLabel = att 
                                ? (att.status === 'present' ? '출석' : att.status === 'late' ? '지각' : '결석')
                                : '대기';
                            const statusColor = att
                                ? (att.status === 'present' ? 'text-ios-emerald bg-ios-emerald/10' : att.status === 'late' ? 'text-ios-amber bg-ios-amber/10' : 'text-ios-rose bg-ios-rose/10')
                                : 'text-gray-400 bg-gray-50';

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
                                            {b.seats?.zones?.name || ''} {b.seats?.zone_name || ''}
                                        </p>
                                        <p className="text-xs font-black text-ios-indigo">
                                            {b.seat_number || b.seats?.seat_number || '-'}번 좌석
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
    <div className="mobile-container flex flex-col bg-[#F2F2F7] h-screen overflow-hidden font-sans pb-[safe-area-inset-bottom]">
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
      {/* Hide bottom nav when in wizard logic if needed, but keeping it allows quick exit */}
      {activeTab !== 'map' && (
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
      )}
      {renderDayDetailModal()}
    </div>
  );
};

export default StudentMobileView;

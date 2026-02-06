import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Home, BarChart3, User, LogOut, Layout,
  ChevronRight, ArrowRight, Clock, CheckCircle2, AlertCircle, Calendar,
  TrendingUp, BookOpen, MapPin, ChevronLeft, X
} from 'lucide-react';
import { 
  format, startOfQuarter, endOfQuarter, isWithinInterval,
  startOfWeek, endOfWeek, eachDayOfInterval, isToday, addWeeks, subWeeks, isSameDay 
} from 'date-fns';
import { ko } from 'date-fns/locale';

const ParentMobileView = ({ onLogout, currentUser }) => {
  const [activeTab, setActiveTab] = useState('home'); // home, stats, profile
  const [schoolName, setSchoolName] = useState('');
  const [todayData, setTodayData] = useState({
    bookings: [],
    attendance: [],
    currentSession: null,
    nextSession: null
  });
  const [weeklyData, setWeeklyData] = useState({}); // { 'yyyy-MM-dd': { bookings: [], attendance: [] } }
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [manageDate, setManageDate] = useState(null);
  
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    earlyLeave: 0,
    history: []
  });
  const [loading, setLoading] = useState(true);
  const [exceptions, setExceptions] = useState([]); // Holiday/Exceptions

  // Helper Functions
  const handlePrevWeek = () => setCurrentCalendarDate(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setCurrentCalendarDate(prev => addWeeks(prev, 1));

  const getDayStatus = (dateStr, dayData) => {
    if (!dayData || !dayData.bookings.length) return null;

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const { bookings, attendance } = dayData;

    if (dateStr > todayStr) return { label: '예약', color: 'text-ios-indigo bg-ios-indigo/10' };

    if (dateStr < todayStr) {
        if (!attendance.length) return { label: '결석', color: 'text-ios-rose bg-ios-rose/10' };
        
        // Check day status priorities for display
        const hasEarlyLeave = attendance.some(a => a.status === 'early_leave');
        if (hasEarlyLeave) return { label: '조퇴', color: 'text-ios-blue bg-ios-blue/10' };

        const isLate = attendance.some(a => a.status === 'late');
        if (isLate) return { label: '지각', color: 'text-ios-amber bg-ios-amber/10' };

        return { label: '이수', color: 'text-ios-emerald bg-ios-emerald/10' };
    }

    const currentTime = format(now, 'HH:mm:ss');
    const sortedBookings = [...bookings].sort((a,b) => 
        (a.sessions?.start_time || '').localeCompare(b.sessions?.start_time || '')
    );
    
    if (!sortedBookings.length) return null;

    const firstStart = sortedBookings[0].sessions?.start_time;
    const lastEnd = sortedBookings[sortedBookings.length - 1].sessions?.end_time;

    const hasEveningBooking = bookings.some(b => (b.sessions?.start_time || '') >= '17:00:00');
    const isClassWindow = currentTime >= '09:00:00' && currentTime <= '17:00:00';

    const activeSession = sortedBookings.find(b => {
        const s = b.sessions;
        return s && currentTime >= s.start_time && currentTime <= s.end_time;
    });

    if (activeSession) {
        const att = attendance.find(a => a.booking_id === activeSession.id);
        if (att) return { label: '학습중', color: 'text-white bg-ios-emerald' }; 
        return { label: '미입실', color: 'text-ios-rose bg-ios-rose/10' }; 
    }

    if (isClassWindow && hasEveningBooking) return { label: '수업', color: 'text-gray-400 bg-gray-100' };
    if (lastEnd && currentTime > lastEnd) return { label: '퇴실', color: 'text-gray-500 bg-gray-100' };
    if (firstStart && currentTime < firstStart) return { label: '예약', color: 'text-ios-indigo bg-ios-indigo/10' };

    return { label: '휴식', color: 'text-ios-amber bg-ios-amber/10' };
  };

  const getStatusDisplay = () => {
    const { bookings, attendance, currentSession } = todayData;
    if (bookings.length === 0) return { label: '학습 예정 없음', color: 'bg-gray-100 text-gray-400', sub: '오늘은 예약된 좌석이 없습니다.' };

    const activeBooking = bookings.find(b => b.session_id === currentSession?.id);
    const hasAnyAttendance = attendance.length > 0;
    
    if (activeBooking) {
      const att = attendance.find(a => a.booking_id === activeBooking.id);
      if (att) return { label: '학습 중', color: 'bg-ios-emerald text-white', sub: `${activeBooking.sessions.name} 진행 중` };
      return { label: '미입실', color: 'bg-ios-rose text-white', sub: '현재 세션 입실이 확인되지 않았습니다.' };
    }

    if (hasAnyAttendance) {
        const lastAtt = attendance.filter(Boolean).sort((a,b) => (b.timestamp_in || '').localeCompare(a.timestamp_in || ''))[0];
        if (lastAtt && lastAtt.timestamp_out) return { label: '귀가 완료', color: 'bg-gray-800 text-white', sub: `${format(new Date(lastAtt.timestamp_out), 'HH:mm')} 퇴실 확인` };
        if (lastAtt) return { label: '휴식 중', color: 'bg-ios-amber text-white', sub: '다음 학습 세션을 기다리는 중입니다.' };
    }

    return { label: '학습 대기', color: 'bg-ios-indigo text-white', sub: '첫 세션 시작 전입니다.' };
  };

  const getExpectedDeparture = () => {
    const { bookings } = todayData;
    if (bookings.length === 0) return '-';
    const last = [...bookings].sort((a, b) => (a.sessions?.end_time || '').localeCompare(b.sessions?.end_time || '')).pop();
    return last?.sessions?.end_time?.substring(0, 5) || '-';
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;
      
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
        // 1. Today's Hero Data
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, sessions (*), attendance (*)')
        .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
        .eq('date', todayStr)
        .order('session_id', { ascending: true });

      // 2. Weekly Calendar Data
      const start = startOfWeek(currentCalendarDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentCalendarDate, { weekStartsOn: 1 });
      
      const { data: weeklyBookings } = await supabase
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
        
      if (weeklyBookings) {
          const dataMap = {};
          weeklyBookings.forEach(b => {
              const d = b.date;
              if (!dataMap[d]) dataMap[d] = { bookings: [], attendance: [] };
              dataMap[d].bookings.push(b);
              if (b.attendance && b.attendance.length > 0) {
                  dataMap[d].attendance.push(...b.attendance);
              }
          });
          setWeeklyData(dataMap);
      }

      // Fetch Exceptions (Holidays)
      const { data: exData } = await supabase
        .from('operation_exceptions')
        .select('*')
        .gte('exception_date', format(start, 'yyyy-MM-dd'))
        .lte('exception_date', format(end, 'yyyy-MM-dd'));
      setExceptions(exData || []);

      // 3. Timing/Sessions
      const { data: allSessions } = await supabase.from('sessions').select('*').order('start_time');
      if (allSessions) {
        const now = new Date();
        const currentTime = format(now, 'HH:mm:ss');
        const current = allSessions.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
        const next = allSessions.find(s => s.start_time > currentTime);
        
        setTodayData({
          bookings: bookings || [],
          attendance: bookings?.flatMap(b => b.attendance).filter(Boolean) || [],
          currentSession: current,
          nextSession: next
        });
      }

      // 4. stats Tab
      if (activeTab === 'stats' || loading) {
        const qStart = format(startOfQuarter(new Date()), 'yyyy-MM-dd');
        const qEnd = format(endOfQuarter(new Date()), 'yyyy-MM-dd');
        
        // Fetch both bookings and study plans for the quarter
        const [bookingsRes, plansRes] = await Promise.all([
          supabase
            .from('bookings')
            .select('id, date, session_id, attendance (status, timestamp_in), sessions (name)')
            .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
            .gte('date', qStart)
            .lte('date', qEnd)
            .order('date', { ascending: false }),
          supabase
            .from('study_plans')
            .select('date, session_id, content')
            .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
            .gte('date', qStart)
            .lte('date', qEnd)
        ]);

        const qBookings = bookingsRes.data;
        const qStudyPlans = plansRes.data;

        if (qBookings) {
          const counts = { present: 0, late: 0, absent: 0, earlyLeave: 0 };
          const history = [];
          
          // Group by Date for Day-based stats
          const bookingsByDate = {};
          
          qBookings.forEach(b => {
            if (!bookingsByDate[b.date]) bookingsByDate[b.date] = [];
            bookingsByDate[b.date].push(b);

             // Prepare History
             const att = b.attendance?.[0];
             // Past booking without attendance check
             const todayStr = format(new Date(), 'yyyy-MM-dd');
             const isPastBooking = b.date < todayStr;
             const status = att?.status || (isPastBooking ? 'absent' : null);
             
             if (status) { // Only add if we have a status (stats or implicit absence)
                 const plan = qStudyPlans?.find(p => p.date === b.date && p.session_id === b.session_id);
                 history.push({
                      date: b.date,
                      status: status, // present, late, absent, early_leave
                      time: att?.timestamp_in ? format(new Date(att.timestamp_in), 'HH:mm') : '-',
                      content: plan?.content || null,
                      session_name: b.sessions?.name
                 });
             }
          });

          // Calculate Stats
          Object.keys(bookingsByDate).forEach(date => {
              // Don't count future dates
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              if (date > todayStr) return;
              
              const dayBookings = bookingsByDate[date];
              const attendedBookings = dayBookings.filter(b => b.attendance && b.attendance.length > 0);
              
              // 1. Lateness (Session based)
              dayBookings.forEach(b => {
                 if (b.attendance?.[0]?.status === 'late') {
                     counts.late++;
                 }
              });

              // 2. Day Status
              if (attendedBookings.length === 0) {
                  // Absence: No attendance at all (check if date is in past)
                  if (date < todayStr) {
                      counts.absent++;
                  }
              } else {
                  // Has some attendance
                  const hasEarlyLeave = attendedBookings.some(b => b.attendance[0].status === 'early_leave');
                  
                  if (hasEarlyLeave) {
                      counts.earlyLeave++;
                  } else if (attendedBookings.length === dayBookings.length) {
                      // All attended, no early leave
                      // This implies "Completion" (이수)
                      counts.present++; 
                  }
              }
          });

          setStats({
            ...counts,
            history: history.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
          });
        }
      }

      setLoading(false);
    };

    const fetchSchoolInfo = async () => {
        const { data } = await supabase.from('configs').select('value').eq('key', 'school_info').single();
        if (data?.value?.name_en) setSchoolName(data.value.name_en);
    };

    fetchData();
    fetchSchoolInfo();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [currentUser, currentCalendarDate, activeTab, loading]);

  const renderHome = () => {
    const status = getStatusDisplay();
    const expected = getExpectedDeparture();
    const lastOut = todayData.attendance.find(a => a.timestamp_out)?.timestamp_out;

    return (
      <div className="h-full p-4 flex flex-col gap-2 animate-fade-in relative scrollbar-hide">
        {/* Status Hero Card (50%) */}
        <div className="flex-[2] glass-card pt-8 pb-5 px-5 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-ios-indigo/10 blur-3xl -z-10" />
          
          <div className={`px-6 py-2 rounded-full text-[13px] font-black uppercase tracking-widest ${status.color} shadow-lg shadow-current/10`}>
            {status.label}
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center space-y-3">
            <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">{currentUser?.full_name}</h2>
          </div>

          <div className="w-full grid grid-cols-3 gap-2 pt-4 border-t border-gray-50">
            <div className="space-y-1">
                <p className="text-[11px] font-black text-ios-gray uppercase tracking-widest">좌석 번호</p>
                <p className="text-[11px] font-black text-[#1C1C1E]">
                    {todayData.bookings[0]?.seat_number || '-'}
                </p>
            </div>
            <div className="space-y-1 border-l border-gray-50">
                <p className="text-[11px] font-black text-ios-gray uppercase tracking-widest">귀가 예정</p>
                <p className="text-[11px] font-black text-[#1C1C1E] underline decoration-ios-indigo/30 underline-offset-4">{expected}</p>
            </div>
            <div className="space-y-1 border-l border-gray-50">
                <p className="text-[11px] font-black text-ios-gray uppercase tracking-widest">실제 퇴실</p>
                <p className="text-[11px] font-black text-ios-indigo">
                    {lastOut ? format(new Date(lastOut), 'HH:mm') : '--:--'}
                </p>
            </div>
          </div>
        </div>

        {/* All Sessions Schedule (25%) */}
        <div className="flex-1 glass-card p-5 flex flex-col justify-center space-y-2">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-[11px] font-black text-ios-gray uppercase tracking-widest">오늘의 학습 일정</h3>
                <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-ios-emerald shadow-[0_0_8px_rgba(52,199,89,0.5)]" />
                    <span className="text-[11px] font-black text-ios-emerald uppercase">Live</span>
                </div>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[120px] pr-1 scrollbar-hide">
                {todayData.bookings.length > 0 ? todayData.bookings.map((booking, idx) => {
                    const att = booking.attendance?.[0];
                    const status = att ? (att.status === 'present' ? { label: '출석', color: 'text-ios-emerald bg-ios-emerald/10' } : att.status === 'late' ? { label: '지각', color: 'text-ios-amber bg-ios-amber/10' } : att.status === 'early_leave' ? { label: '조퇴', color: 'text-ios-blue bg-ios-blue/10' } : { label: '결석', color: 'text-ios-rose bg-ios-rose/10' }) : { label: '대기', color: 'text-gray-400 bg-gray-50' };
                    
                    return (
                        <div key={booking.id} className={`flex items-center justify-between py-2 ${idx !== todayData.bookings.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${att?.status === 'present' ? 'bg-ios-emerald' : att?.status === 'late' ? 'bg-ios-amber' : att?.status === 'early_leave' ? 'bg-ios-blue' : 'bg-gray-200'}`} />
                                <div>
                                    <p className="text-[11px] font-black text-[#1C1C1E] leading-none mb-1">{booking.sessions?.name}</p>
                                    <p className="text-[11px] font-bold text-ios-gray leading-none">
                                        {booking.sessions?.start_time.substring(0,5)} - {booking.sessions?.end_time.substring(0,5)}
                                    </p>
                                </div>
                            </div>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${status.color}`}>
                                {status.label}
                            </span>
                        </div>
                    );
                }) : (
                    <div className="flex flex-col items-center justify-center py-4 bg-gray-50 rounded-2xl">
                        <p className="text-[11px] font-black text-ios-gray">오늘 예정된 세션이 없습니다.</p>
                    </div>
                )}
            </div>
        </div>

        {/* Weekly Dashboard Calendar (25%) */}
        <div className="flex-1 glass-card p-5 flex flex-col justify-center items-center">
            <div className="w-full flex items-center justify-between mb-3 px-1">
                <h3 className="text-[11px] font-black text-ios-gray uppercase tracking-widest">이번 주 학습 현황</h3>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-[#1C1C1E]">
                        {format(startOfWeek(currentCalendarDate, { weekStartsOn: 1 }), 'yyyy.MM.dd', { locale: ko })} - {format(endOfWeek(currentCalendarDate, { weekStartsOn: 1 }), 'yyyy.MM.dd', { locale: ko })}
                    </span>
                    <button onClick={handlePrevWeek} className="p-1 hover:text-black text-gray-400 ios-tap"><ChevronLeft className="w-3 h-3" /></button>
                    <button onClick={handleNextWeek} className="p-1 hover:text-black text-gray-400 ios-tap"><ChevronRight className="w-3 h-3" /></button>
                </div>
            </div>

            <div className="flex justify-between items-center w-full">
                {eachDayOfInterval({ 
                    start: startOfWeek(currentCalendarDate, { weekStartsOn: 1 }), 
                    end: endOfWeek(currentCalendarDate, { weekStartsOn: 1 }) 
                }).map((day, i) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayData = weeklyData[dateStr];
                    const status = getDayStatus(dateStr, dayData);
                    const isCur = isSameDay(day, new Date());
                    
                    let bgClass = isCur 
                        ? (status 
                            ? 'bg-ios-indigo text-white shadow-md' 
                            : 'bg-white/50 border border-white/40 text-[#1C1C1E]') 
                        : 'bg-white/50 border border-white/40 text-gray-300';

                    if (status?.label === '이수' || status?.label === '학습중' || status?.label === '출석') {
                        bgClass = 'bg-ios-emerald text-white shadow-sm border-none';
                    } else if (status?.label === '지각') {
                        bgClass = 'bg-ios-amber text-white shadow-sm border-none';
                    } else if (status?.label === '조퇴') {
                        bgClass = 'bg-ios-blue text-white shadow-sm border-none';
                    } else if (status?.label === '결석' || status?.label === '미입실') {
                        bgClass = 'bg-ios-rose text-white shadow-sm border-none';
                    } else if (status?.label === '예약') {
                        bgClass = 'bg-ios-indigo text-white shadow-sm border-none';
                    }
                    
                    const isWeekend = i === 5 || i === 6;
                    const isHoliday = exceptions.some(ex => ex.date === dateStr);

                    let labelColor = 'text-gray-300';
                    if (isCur) labelColor = 'text-ios-indigo';
                    else if (isHoliday || isWeekend) labelColor = 'text-ios-rose/40';
                    else if (dayData && dayData.bookings.length > 0) labelColor = 'text-ios-indigo';

                    return (
                        <div 
                            key={i} 
                            className={`flex flex-col items-center gap-4 ${dayData ? 'cursor-pointer' : ''}`}
                            onClick={() => dayData && setManageDate(day)}
                        >
                            <span className={`text-[11px] font-black ${labelColor}`}>
                                {['월','화','수','목','금','토','일'][i]}
                            </span>
                            <div className={`w-7 h-7 rounded-ios flex items-center justify-center text-[11px] font-black transition-all ${bgClass}`}>
                                {format(day, 'd')}
                            </div>
                            <div className="h-3 flex items-center justify-center">
                                {status ? (
                                    <span className={`text-[11px] font-bold px-1 py-0.5 rounded-full whitespace-nowrap ${status.color}`}>
                                        {status.label}
                                    </span>
                                ) : isCur ? (
                                    <span className="text-[11px] font-black text-ios-indigo">오늘</span>
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
    );
  };

  const renderStats = () => {
    return (
      <div className="p-5 space-y-6 animate-fade-in scrollbar-hide">
        <div className="glass-card p-8 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-6 text-ios-indigo"><BarChart3 className="w-4 h-4" /><h3 className="text-xs font-black uppercase tracking-widest">이번 분기 학습 요약</h3></div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center p-4 bg-ios-emerald/5 rounded-apple">
                    <span className="text-[10px] font-black text-ios-emerald uppercase opacity-60 mb-1">이수</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-ios-emerald">{stats.present}</span>
                        <span className="text-xs font-bold text-ios-emerald/70">일</span>
                    </div>
                </div>
                <div className="flex flex-col items-center p-4 bg-ios-rose/5 rounded-apple">
                    <span className="text-[10px] font-black text-ios-rose uppercase opacity-60 mb-1">결석</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-ios-rose">{stats.absent}</span>
                        <span className="text-xs font-bold text-ios-rose/70">일</span>
                    </div>
                </div>
                <div className="flex flex-col items-center p-4 bg-ios-amber/5 rounded-apple">
                    <span className="text-[10px] font-black text-ios-amber uppercase opacity-60 mb-1">지각</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-ios-amber">{stats.late}</span>
                        <span className="text-xs font-bold text-ios-amber/70">회</span>
                    </div>
                </div>
                <div className="flex flex-col items-center p-4 bg-ios-blue/5 rounded-apple">
                    <span className="text-[10px] font-black text-ios-blue uppercase opacity-60 mb-1">조퇴</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-ios-blue">{stats.earlyLeave}</span>
                        <span className="text-xs font-bold text-ios-blue/70">일</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-black text-[#1C1C1E] uppercase tracking-widest">최근 학습 일지</h3>
                <span className="text-[10px] font-bold text-ios-gray">최근 15기록</span>
            </div>
            <div className="space-y-3">
                {stats.history.length > 0 ? stats.history.map((h, i) => (
                    <div key={i} className="bg-white p-4 rounded-apple border border-gray-100 shadow-sm space-y-3 transition-all active:scale-[0.98]">
                        <div className="flex items-center justify-between">

                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${h.status === 'present' ? 'bg-ios-emerald' : h.status === 'late' ? 'bg-ios-amber' : h.status === 'early_leave' ? 'bg-ios-blue' : 'bg-ios-rose'}`} />
                                <div className="space-y-0.5">
                                    <p className="text-xs font-black text-[#1C1C1E]">
                                        {format(new Date(h.date), 'M월 d일 (EEE)', { locale: ko })}
                                        {h.session_name && <span className="text-[10px] text-ios-gray font-bold ml-1.5">· {h.session_name}</span>}
                                    </p>
                                    <p className="text-[10px] font-bold text-ios-gray uppercase tracking-widest leading-none">
                                        {h.status === 'present' ? '정상 이수' : h.status === 'late' ? '지각입실' : h.status === 'early_leave' ? '조퇴' : '미출석'}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-xs font-black text-ios-gray">{h.time !== '-' ? h.time : '--:--'}</p>
                                 <p className="text-[9px] font-bold text-ios-gray/40 uppercase tracking-tighter leading-none">Entry Time</p>
                            </div>
                        </div>
                        
                        {h.content && (
                            <div className="pt-3 border-t border-gray-50 flex gap-3">
                                <div className="p-2 bg-ios-indigo/5 rounded-apple flex-shrink-0">
                                    <BookOpen className="w-3.5 h-3.5 text-ios-indigo" />
                                </div>
                                <div className="flex-1 flex items-center">
                                    <p className="text-xs font-bold text-gray-800 leading-relaxed">
                                        {h.content}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )) : (
                    <div className="py-20 text-center space-y-2"><Calendar className="w-10 h-10 text-gray-200 mx-auto" /><p className="text-xs font-black text-ios-gray">학습 기록이 없습니다.</p></div>
                )}
            </div>
        </div>
      </div>
    );
  };


  const renderDayDetailModal = () => {
    if (!manageDate) return null;
    
    const dateStr = format(manageDate, 'yyyy-MM-dd');
    const dayData = weeklyData[dateStr];
    const bookingsForDate = dayData?.bookings || [];

    const sortedBookings = [...bookingsForDate].sort((a, b) => 
        (a.sessions?.start_time || '').localeCompare(b.sessions?.start_time || '')
    );

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative animate-spring-up">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black text-[#1C1C1E]">
                            {format(manageDate, 'M월 d일')} 학습 상세
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

                            const att = b.attendance?.[0] || b.attendance; 
                            const attObj = Array.isArray(att) ? att[0] : att;
                            const isPastSession = isToday && sessionEndTime && currentTime > sessionEndTime;
                            
                            const statusLabel = attObj 
                                ? (attObj.status === 'present' ? '출석' : attObj.status === 'late' ? '지각' : attObj.status === 'early_leave' ? '조퇴' : '결석')
                                : (isPastSession ? '결석' : '대기');

                            const statusColor = attObj
                                ? (attObj.status === 'present' ? 'text-ios-emerald bg-ios-emerald/10' : attObj.status === 'late' ? 'text-ios-amber bg-ios-amber/10' : attObj.status === 'early_leave' ? 'text-ios-blue bg-ios-blue/10' : 'text-ios-rose bg-ios-rose/10')
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
                                        {attObj?.timestamp_in && (
                                            <p className="text-[10px] text-ios-gray font-bold mt-1">
                                                입실: {format(new Date(attObj.timestamp_in), 'HH:mm')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="py-12 text-center space-y-2">
                                <Calendar className="w-10 h-10 text-gray-200 mx-auto" />
                                <p className="text-sm font-bold text-gray-400">등록된 학습 정보가 없습니다.</p>
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
      <header className="flex-none glass-header px-6 pt-4 pb-4 flex items-center justify-between shadow-sm">
        <div className="flex flex-col">
            <h1 className="text-2xl font-black text-[#1C1C1E] tracking-tight">{schoolName.split(' ')[0]}</h1>
            <p className="text-[10px] font-black text-ios-indigo tracking-[0.2em] uppercase opacity-70">PARENT VIEW</p>
        </div>
        <button 
            onClick={onLogout}
            className="p-3 bg-gray-200/20 text-ios-gray hover:text-ios-rose hover:bg-ios-rose/10 rounded-apple-md transition-all ios-tap border border-white/40 backdrop-blur-xl"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>
      <main className="flex-1 overflow-hidden relative">
          {loading ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4 animate-pulse"><div className="w-20 h-20 bg-gray-200 rounded-[2rem]" /><div className="h-4 w-32 bg-gray-200 rounded-full" /></div>
          ) : (
            <div className="h-full overflow-y-auto scrollbar-hide">
              {activeTab === 'home' ? renderHome() : renderStats()}
            </div>
          )}
      </main>
      {/* Bottom Navigation */}
      <nav className="flex-none glass-material pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))] pt-2 px-16 flex justify-around items-center z-50 shadow-[0_-4px_40px_rgba(0,0,0,0.03)] border-t border-white/40">
        {[
          { id: 'home', icon: Home, label: '모니터링' },
          { id: 'stats', icon: BarChart3, label: '통계' },
        ].map((item) => (
          <button 
            key={item.id} 
            onClick={() => setActiveTab(item.id)} 
            className={`flex flex-col items-center justify-center p-2 rounded-apple-md transition-all duration-300 w-20 group ios-tap ${activeTab === item.id ? 'text-[#1C1C1E]' : 'text-gray-300 hover:text-gray-500'}`}
          >
            <item.icon className={`w-7 h-7 stroke-[2.5px] ${activeTab === item.id ? 'fill-ios-indigo/10' : 'fill-transparent'}`} />
            <span className={`text-[9px] font-black mt-1`}>
                {item.label}
            </span>
          </button>
        ))}
      </nav>
      {renderDayDetailModal()}
    </div>
  );
};

export default ParentMobileView;

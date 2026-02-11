import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BookOpen, Award, Trees as Tree, Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';

const UserProfile = ({ user }) => {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    cumulativeDays: 0,
    cumulativeTime: 0, // minutes
    attendanceRate: 0,
    lateCount: 0
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [bookings, setBookings] = useState([]); // For calendar visualization

  useEffect(() => {
    if (!user) return;

    const fetchProfileData = async () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1; // 0-indexed
        
        // Dynamic Academic Year: Starts on March 1st
        // If Jan or Feb, belongs to previous year's academic calendar
        const academicYear = month >= 3 ? year : year - 1;
        const startOfAcademicYear = `${academicYear}-03-01`;
        const todayStr = format(today, 'yyyy-MM-dd');

        // 1. Fetch Bookings & Attendance for Stats & Calendar
        const { data: bookingData } = await supabase
            .from('bookings')
            .select(`
                *,
                sessions (id, name, start_time, end_time),
                attendance (id, booking_id, status, timestamp_in, timestamp_out)
            `)
            .or(`user_id.eq.${user.id},student_id.eq.${user.id}`)
            .gte('date', startOfAcademicYear);

        if (bookingData) {
            setBookings(bookingData);
            
            // Calculate Stats
            let totalBookings = 0;
            let attendedCount = 0;
            let lates = 0;
            let studyMinutes = 0;
            const studyDaysSet = new Set();
            
            const now = new Date(); // To exclude future sessions today

            bookingData.forEach(b => {
                const isFutureDate = b.date > todayStr;
                if (isFutureDate) return; 

                // Refined Total Bookings Logic:
                let shouldCountAsBooking = true;
                if (b.date === todayStr && b.sessions) {
                    const sessionStart = new Date(`${b.date}T${b.sessions.start_time}+09:00`);
                    if (now < sessionStart) {
                        shouldCountAsBooking = false; // Session hasn't started yet
                    }
                }
                
                if (shouldCountAsBooking) {
                    totalBookings++;
                }

                // Check attendance robustly (handle array or object)
                const atts = Array.isArray(b.attendance) ? b.attendance : (b.attendance ? [b.attendance] : []);
                const att = atts[0];
                const validStatus = ['present', 'late', 'early_leave'];
                
                if (att && validStatus.includes(att.status)) {
                    attendedCount++; 
                    studyDaysSet.add(b.date);
                    if (att.status === 'late') lates++;

                    // Precise Time Calculation
                    if (b.sessions) {
                        const sessionStart = new Date(`${b.date}T${b.sessions.start_time}+09:00`);
                        const sessionEnd = new Date(`${b.date}T${b.sessions.end_time}+09:00`);
                        
                        let effectiveStart = sessionStart;
                        if (att.timestamp_in) {
                            const checkIn = new Date(att.timestamp_in);
                            if (checkIn > sessionStart) effectiveStart = checkIn;
                        }
                        
                        let effectiveEnd = sessionEnd;
                        if (att.timestamp_out) {
                            const checkOut = new Date(att.timestamp_out);
                            if (checkOut < sessionEnd) effectiveEnd = checkOut;
                        }

                        if (effectiveEnd > effectiveStart) {
                            const duration = (effectiveEnd - effectiveStart) / (1000 * 60);
                            studyMinutes += duration;
                        }
                    }
                }
            });

            setStats({
                cumulativeDays: studyDaysSet.size,
                cumulativeTime: Math.round(studyMinutes),
                attendanceRate: totalBookings > 0 ? Math.round((attendedCount / totalBookings) * 100) : 0,
                lateCount: lates
            });
        }

        // 2. Fetch Leaderboard (RPC)
        try {
            const { data: lbData } = await supabase.rpc('get_elite_leaderboard', { 
                start_date: startOfAcademicYear, 
                end_date: todayStr 
            });
            
            if (lbData) {
                // Map RPC result to UI format
                const formattedLeaderboard = lbData.map(item => ({
                    rank: item.rank,
                    name: item.student_name,  // RPC returns student_name
                    info: `${item.grade}학년`, // RPC returns grade
                    score: Math.round(item.total_time_minutes || 0) // RPC returns total_time_minutes
                }));
                setLeaderboard(formattedLeaderboard);
            } else {
                setLeaderboard([]); 
            }
        } catch (e) {
            console.warn('Leaderboard fetch failed:', e);
            setLeaderboard([]);
        }
    };

    fetchProfileData();
  }, [user]);

  const currentMonthDays = eachDayOfInterval({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  const formatStudyTime = (minutes) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}시간 ${m}분`;
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 1. Attendance Calendar (Top) */}
      <div className="animate-spring-up">
        <div className="bg-white rounded-[32px] p-10 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black flex items-center gap-3">
              <div className="w-10 h-10 rounded-ios bg-ios-indigo/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-ios-indigo" />
              </div>
              학습 활동 리포트
            </h3>
          </div>

          <div className="grid grid-cols-7 gap-3 text-center mb-6">
            {['일','월','화','수','목','금','토'].map((d, i) => (
              <span key={i} className="text-[11px] font-black text-ios-gray uppercase tracking-widest">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {currentMonthDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const allBookingsForDay = bookings.filter(b => b.date === dateStr);
              let status = null; 
              
              if (allBookingsForDay.length > 0) {
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  if (dateStr > todayStr) {
                      status = 'booking';
                  } else {
                      // Aggregate all bookings for the day to determine priority status
                      const allAtts = allBookingsForDay.flatMap(b => {
                          return Array.isArray(b.attendance) ? b.attendance : (b.attendance ? [b.attendance] : []);
                      });

                      const totalSessions = allBookingsForDay.length;
                      const attendedCount = allAtts.filter(a => a.status === 'present' || a.status === 'early_leave').length;

                      if (attendedCount === totalSessions) {
                          status = 'present'; // All sessions attended
                      } else if (attendedCount > 0) {
                          status = 'partial'; // Some sessions attended
                      } else if (allAtts.some(a => a.status === 'late')) {
                          status = 'late';
                      } else {
                          status = 'absent';
                      }
                  }
              }

              const isSelected = isToday(day);
              
              return (
                <div 
                   key={idx}
                   className={`aspect-square rounded-ios flex items-center justify-center text-[12px] font-black transition-all duration-500 ios-tap relative group ${
                    isSelected ? 'bg-ios-indigo text-white shadow-xl scale-[1.15] z-10' :
                    status === 'present' ? 'bg-ios-emerald/10 text-ios-emerald' :
                    status === 'partial' ? 'bg-ios-blue/10 text-ios-blue' :
                    status === 'late' ? 'bg-ios-amber/10 text-ios-amber' :
                    status === 'absent' ? 'bg-ios-rose/10 text-ios-rose' :
                    status === 'booking' ? 'bg-ios-indigo/10 text-ios-indigo' :
                    'bg-gray-50 text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                  }`}
                >
                  {format(day, 'd')}
                  {status && !isSelected && status !== 'booking' && (
                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${
                      status === 'present' ? 'bg-ios-emerald' :
                      status === 'partial' ? 'bg-ios-blue' :
                      status === 'late' ? 'bg-ios-amber' : 'bg-ios-rose'
                    }`} />
                  )}
                  {status === 'booking' && !isSelected && (
                      <div className="absolute bottom-1 w-1 h-1 rounded-full bg-ios-indigo" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-10 pt-8 border-t border-gray-100">
             <div className="flex flex-col gap-4">
                <span className="text-[11px] font-black text-ios-gray uppercase tracking-[0.2em]">활동 지표</span>
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: '출석', color: 'bg-ios-emerald' },
                    { label: '일부이수', color: 'bg-ios-blue' },
                    { label: '지각', color: 'bg-ios-amber' },
                    { label: '결석', color: 'bg-ios-rose' },
                    { label: '수업', color: 'bg-gray-100' },
                    { label: '예약', color: 'bg-ios-indigo' }
                  ].map(leg => (
                    <div key={leg.label} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${leg.color}`} />
                      <span className="text-[10px] font-bold text-gray-400">{leg.label}</span>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 overflow-visible">
        {/* Left: Stats */}
        <div className="xl:col-span-2 flex flex-col gap-4 md:gap-6 animate-spring-up" style={{ animationDelay: '100ms' }}>
          <div className="grid grid-cols-2 gap-4 md:gap-6">
             <div className="col-span-2 bg-white rounded-[32px] p-8 flex flex-col items-center text-center gap-2 group transition-all duration-500 ios-tap border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-ios-amber/10 blur-3xl -z-10" />
                 <div className="w-16 h-16 rounded-ios bg-ios-amber/10 text-ios-amber flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform mb-2">
                   <Award className="w-8 h-8" />
                 </div>
                 <p className="text-[11px] uppercase font-black text-ios-gray tracking-widest">이번 학년도 누적 학습</p>
                 <div className="flex flex-col items-center">
                      <p className="text-4xl font-black text-[#1C1C1E]">{stats.cumulativeDays}일</p>
                      <p className="text-sm font-bold text-gray-400 mt-1">{formatStudyTime(stats.cumulativeTime)}</p>
                 </div>
             </div>

             <div className="bg-white rounded-[32px] p-8 flex flex-col items-center text-center gap-4 group transition-all duration-500 ios-tap border border-gray-100 shadow-sm">
                 <div className="w-12 h-12 rounded-ios bg-ios-emerald/10 text-ios-emerald flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                   <CheckCircle2 className="w-6 h-6" />
                 </div>
                 <div>
                    <p className="text-[10px] uppercase font-black text-ios-gray tracking-widest mb-1">출석률</p>
                    <p className="text-2xl font-black text-[#1C1C1E]">{stats.attendanceRate}%</p>
                 </div>
             </div>

             <div className="bg-white rounded-[32px] p-8 flex flex-col items-center text-center gap-4 group transition-all duration-500 ios-tap border border-gray-100 shadow-sm">
                 <div className="w-12 h-12 rounded-ios bg-ios-rose/10 text-ios-rose flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                   <AlertTriangle className="w-6 h-6" />
                 </div>
                 <div>
                    <p className="text-[10px] uppercase font-black text-ios-gray tracking-widest mb-1">지각 횟수</p>
                    <p className="text-2xl font-black text-[#1C1C1E]">{stats.lateCount}회</p>
                 </div>
             </div>
          </div>
        </div>

        {/* Right: Elite Member */}
        <div className="animate-spring-up" style={{ animationDelay: '200ms' }}>
          <div className="bg-gradient-to-br from-ios-indigo via-[#7D7AFF] to-[#9B99FF] rounded-[32px] p-10 text-white shadow-2xl shadow-ios-indigo/30 relative overflow-hidden group ios-tap">
             <div className="relative z-10">
               <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-6 shadow-inner-white">
                 <Award className="w-8 h-8 text-white" />
               </div>
               <h4 className="text-2xl font-black tracking-tight mb-2">엘리트 멤버</h4>
               <p className="text-[15px] text-white/80 font-medium mb-8 leading-relaxed">상위 5% 학습 달성자입니다.<br/>명예의 전당 배지가 활성화되었습니다.</p>
               <button 
                  onClick={() => setShowLeaderboard(true)}
                  className="w-full py-4 bg-black hover:bg-gray-900 rounded-2xl text-xs font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10"
               >
                  순위표 보기
               </button>
             </div>
             <div className="absolute -right-16 -top-16 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-[2000ms]"></div>
             <div className="absolute left-[-10%] bottom-[-10%] w-40 h-40 bg-white/5 rounded-full blur-2xl group-hover:translate-x-10 transition-transform duration-[2000ms]"></div>
          </div>
        </div>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLeaderboard(false)} />
            <div className="bg-white rounded-ios p-8 w-full max-w-md relative z-10 shadow-2xl animate-spring-up">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black flex items-center gap-3">
                        <div className="w-10 h-10 rounded-ios bg-ios-amber/20 flex items-center justify-center">
                                <Award className="w-5 h-5 text-ios-amber" />
                        </div>
                        명예의 전당
                    </h3>
                    <div className="bg-gray-100 rounded-full px-3 py-1">
                        <span className="text-[10px] font-bold text-gray-500">
                            TOP 10
                        </span>
                    </div>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    {leaderboard.length > 0 ? leaderboard.map((ranker, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-ios bg-gray-50 border border-gray-100/50">
                            <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 flex items-center justify-center font-black rounded-full shadow-sm ${
                                    i === 0 ? 'bg-yellow-400 text-white' :
                                    i === 1 ? 'bg-gray-400 text-white' :
                                    i === 2 ? 'bg-orange-400 text-white' :
                                    'bg-white text-gray-400 border border-gray-200'
                                }`}>
                                    {ranker.rank}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-[#1C1C1E]">{ranker.name}</span>
                                        <span className="text-[10px] font-bold text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                                            {ranker.info}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs font-bold text-ios-indigo bg-ios-indigo/5 px-2 py-1 rounded-lg">
                                {formatStudyTime(ranker.score)}
                            </p>
                        </div>
                    )) : (
                        <div className="text-center py-12 text-gray-400 font-medium text-sm bg-gray-50 rounded-ios">
                            학습이 시작 되면, 순위가 자동 집계됩니다.
                        </div>
                    )}
                </div>

                <button 
                    onClick={() => setShowLeaderboard(false)}
                    className="w-full mt-6 py-4 bg-ios-indigo text-white rounded-ios font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
                >
                    닫기
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;

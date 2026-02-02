import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, ShieldCheck, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { format, addMinutes, subMinutes, isBefore, isAfter, parse } from 'date-fns';

const AttendanceCheck = ({ user, isEarlyLeaveMode = false, onSuccess }) => {
  const [status, setStatus] = useState('idle'); // idle, locating, verified, error, done
  const [message, setMessage] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const getKSTISOString = () => {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstTime = new Date(now.getTime() + kstOffset);
    return kstTime.toISOString().replace('Z', '+09:00');
  };

  // Find the session that is currently open for verification: 5m before to 30m after start
  const findActiveWindowSession = useCallback((sessions) => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    
    return sessions.find(s => {
      const startTime = parse(`${todayStr} ${s.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
      const windowStart = subMinutes(startTime, 10);
      const windowEnd = addMinutes(startTime, 30);
      
      return isAfter(now, windowStart) && isBefore(now, windowEnd);
    });
  }, []);

  useEffect(() => {
    const fetchAndSetActiveSession = async () => {
      setLoadingSession(true);
      const { data: sessions } = await supabase.from('sessions').select('*');
      
      if (sessions) {
        const active = findActiveWindowSession(sessions);
        setActiveSession(active);
      }
      setLoadingSession(false);
    };

    fetchAndSetActiveSession();

    // Refresh every 30 seconds to update window availability
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      fetchAndSetActiveSession();
    }, 30000);

    return () => clearInterval(timer);
  }, [findActiveWindowSession]);

// Inside AttendanceCheck component
  // 1. Logic for button modes
  const [isWithin10MinOfNext, setIsWithin10MinOfNext] = useState(false);
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
        if (!user) return;
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        
        // Check if user has ANY active attendance for current or next session
        const { data: allSessions } = await supabase.from('sessions').select('*').order('start_time', { ascending: true });
        
        if (allSessions) {
            const currentTime = format(now, 'HH:mm:ss');
            const active = allSessions.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
            const next = allSessions.find(s => s.start_time > currentTime);

            // Time check for 10min window
            if (next) {
                const nextStart = parse(`${todayStr} ${next.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
                const diff = (nextStart.getTime() - now.getTime()) / (1000 * 60);
                setIsWithin10MinOfNext(diff >= 0 && diff <= 10);
            } else {
                setIsWithin10MinOfNext(false);
            }

            // Attendance check
            const targetSession = active || next;
            if (targetSession) {
                const { data: att } = await supabase
                    .from('bookings')
                    .select('attendance(timestamp_in)')
                    .eq('user_id', user.id)
                    .eq('date', todayStr)
                    .eq('session_id', targetSession.id)
                    .maybeSingle();
                setHasCheckedInToday(!!att?.attendance?.[0]?.timestamp_in);
            }
        }
    };
    checkStatus();
    const itv = setInterval(checkStatus, 30000);
    return () => clearInterval(itv);
  }, [user, activeSession]);

  const handleAction = async (mode) => {
    setStatus('locating');
    setMessage('위치를 확인하고 있습니다...');

    if (!navigator.geolocation) {
      setStatus('error');
      setMessage('이 브라우저는 위경도 정보를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      // 1. Fetch Global GPS Settings
      const { data: gpsData } = await supabase.from('configs').select('value').eq('key', 'gps_settings').single();
      const gpsValue = gpsData?.value || {};
      const targetPoints = gpsValue.points || [{ lat: gpsValue.lat || 37.5665, lng: gpsValue.lng || 126.9780, name: '기본 지점' }];
      const targetRadius = gpsValue.radius || 100;

      // 2. Verify Distance
      let isWithinRange = false;
      let minDistance = Infinity;
      const R = 6371e3;

      targetPoints.forEach(point => {
          const φ1 = latitude * Math.PI/180;
          const φ2 = point.lat * Math.PI/180;
          const Δφ = (point.lat-latitude) * Math.PI/180;
          const Δλ = (point.lng-longitude) * Math.PI/180;
          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const d = R * c;
          if (d < minDistance) minDistance = d;
          if (d <= targetRadius) isWithinRange = true;
      });

      if (!isWithinRange) {
        setStatus('error');
        if (accuracy > 1000) {
          setMessage(`위치 정보가 부정확합니다. 스마트폰 GPS를 켜주세요.`);
        } else {
          setMessage(`외부에서는 처리할 수 없습니다. (${Math.round(minDistance)}m 차이)`);
        }
        return;
      }

      try {
          const today = format(new Date(), 'yyyy-MM-dd');
          const nowKSTISO = getKSTISOString();
          
          let targetSession = activeSession;
          if (!targetSession) {
              const { data: allSess } = await supabase.from('sessions').select('*').order('start_time', { ascending: true });
              const curTime = format(new Date(), 'HH:mm:ss');
              targetSession = allSess.find(s => s.start_time > curTime);
          }

          if (!targetSession) throw new Error('세션 정보를 찾을 수 없습니다.');

          const { data: booking } = await supabase.from('bookings').select('id').eq('user_id', user.id).eq('date', today).eq('session_id', targetSession.id).maybeSingle();
          if (!booking) throw new Error(`'${targetSession.name}' 예약 내역이 없습니다.`);

          if (mode === 'attendance') {
              const startTime = parse(`${today} ${targetSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
              const finalStatus = isAfter(new Date(), addMinutes(startTime, 10)) ? 'late' : 'present';
              await supabase.from('attendance').upsert({ booking_id: booking.id, status: finalStatus, timestamp_in: nowKSTISO, updated_at: new Date().toISOString() }, { onConflict: 'booking_id' });
              setMessage(`'${targetSession.name}' 출석 완료!`);
          } else { // mode === 'leave'
              await supabase.from('attendance').upsert({ booking_id: booking.id, status: 'early_leave', timestamp_out: nowKSTISO, updated_at: new Date().toISOString() }, { onConflict: 'booking_id' });
              setMessage(`'${targetSession.name}' 조퇴/퇴실 완료!`);
          }
          setStatus('done');
          if (onSuccess) setTimeout(onSuccess, 1500);
      } catch (err) {
          setMessage(err.message || '오류가 발생했습니다.');
          setStatus('error');
      }
    }, (error) => {
      setStatus('error');
      setMessage('위치 정보를 가져올 수 없습니다.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const showAttendanceBtn = activeSession || isWithin10MinOfNext;
  const showEarlyLeaveBtn = isEarlyLeaveMode || (isWithin10MinOfNext && !activeSession) || hasCheckedInToday;

  return (
    <div className="bg-white p-8 max-w-[360px] w-full text-center space-y-6 relative overflow-hidden rounded-[32px] shadow-2xl border border-gray-50 animate-spring-up">
      <div className="absolute top-0 left-0 w-32 h-32 bg-ios-indigo/5 blur-3xl -z-10" />
      
      <div className={`w-16 h-16 rounded-[1.2rem] mx-auto flex items-center justify-center transition-all duration-700 shadow-sm border ${
        status === 'verified' || status === 'done' ? 'bg-ios-emerald/10 text-ios-emerald border-ios-emerald/20' :
        status === 'error' ? 'bg-ios-rose/10 text-ios-rose border-ios-rose/20' :
        status === 'locating' ? 'bg-ios-indigo/10 text-ios-indigo animate-pulse border-ios-indigo/20' :
        'bg-white text-gray-200 border-gray-100'
      }`}>
        {status === 'done' ? <CheckCircle2 className="w-8 h-8" /> :
         status === 'error' ? <AlertCircle className="w-8 h-8" /> :
         status === 'locating' ? <MapPin className="w-8 h-8" /> :
         <ShieldCheck className="w-8 h-8" />}
      </div>

      <div className="space-y-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black border ${
            hasCheckedInToday ? 'bg-ios-rose/5 text-ios-rose border-ios-rose/10' : 'bg-ios-indigo/5 text-ios-indigo border-ios-indigo/10'
        }`}>
            <Clock className="w-3.5 h-3.5" />
            {hasCheckedInToday ? '현재 세션 입실 중' : (activeSession ? `'${activeSession.name}' 진행 중` : '세션 대기 중')}
        </div>
        
        <h3 className="text-[26px] font-black tracking-tight text-[#1C1C1E] leading-tight">
            {status === 'done' ? '완료되었습니다' : status === 'locating' ? '위치 확인 중' : '출석 및 조퇴 확인'}
        </h3>
        
        <p className="text-sm font-bold text-ios-gray leading-relaxed px-4">
            {status === 'done' ? '정상적으로 처리되었습니다.' : '원하시는 작업을 선택해주세요.'}
        </p>
      </div>

      <div className="space-y-3 pt-2">
          {message && (
              <p className={`text-[12px] font-black p-3.5 rounded-apple-md ${status === 'error' ? 'bg-ios-rose/5 text-ios-rose border border-ios-rose/10' : 'bg-ios-emerald/5 text-ios-emerald border border-ios-emerald/10'}`}>
                  {message}
              </p>
          )}

          {status !== 'done' && (
            <>
                {/* 1. Attendance Button: Only if a session is active or starting soon AND not yet checked in */}
                {showAttendanceBtn && !hasCheckedInToday && (
                    <button 
                        onClick={() => handleAction('attendance')}
                        disabled={status === 'locating'}
                        className="w-full py-[20px] bg-ios-indigo text-white rounded-3xl font-black text-[17px] shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] ios-tap"
                    >
                        {activeSession ? `${activeSession.name} 출석 인증` : '다음 세션 출석 인증'}
                    </button>
                )}

                {/* 2. Early Leave Button: Always available in early leave mode OR during break pre-session */}
                {(showEarlyLeaveBtn || hasCheckedInToday) && (
                    <button 
                        onClick={() => handleAction('leave')}
                        disabled={status === 'locating'}
                        className={`w-full py-[20px] rounded-3xl font-black text-[17px] transition-all active:scale-[0.98] ios-tap ${
                            hasCheckedInToday ? 'bg-ios-rose text-white shadow-xl shadow-red-500/20' : 'bg-ios-rose/10 text-ios-rose border border-ios-rose/20'
                        }`}
                    >
                        {hasCheckedInToday ? '지금 조퇴하기' : '미리 퇴실 신청'}
                    </button>
                )}
                
                {!showAttendanceBtn && !showEarlyLeaveBtn && !hasCheckedInToday && (
                    <div className="bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-200">
                         <p className="text-xs font-bold text-gray-400">현재 인증 가능한 시간이 아닙니다.</p>
                    </div>
                )}
            </>
          )}
      </div>
    </div>
  );
};

export default AttendanceCheck;

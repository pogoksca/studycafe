import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, ShieldCheck, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { format, addMinutes, subMinutes, isBefore, isAfter, parse } from 'date-fns';

const AttendanceCheck = ({ user }) => {
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
      const windowStart = subMinutes(startTime, 5);
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

  const verifyLocation = async () => {
    if (!activeSession) return;

    setStatus('locating');
    setMessage('위치를 확인하고 있습니다...');

    if (!navigator.geolocation) {
      setStatus('error');
      setMessage('이 브라우저는 위경도 정보를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      // 1. Fetch Global GPS Settings (Shared across all zones)
      const { data: gpsData } = await supabase
        .from('configs')
        .select('value')
        .eq('key', 'gps_settings')
        .single();
      
      const gpsValue = gpsData?.value || {};
      const targetPoints = gpsValue.points || [
          { 
            lat: gpsValue.lat || 37.5665, 
            lng: gpsValue.lng || 126.9780, 
            name: '기본 지점' 
          }
      ];
      const targetRadius = gpsValue.radius || 100;

      // 2. Verify Distance
      let isWithinRange = false;
      let minDistance = Infinity;
      let nearestPointBox = null;
      const R = 6371e3; // metres

      targetPoints.forEach(point => {
          const φ1 = latitude * Math.PI/180;
          const φ2 = point.lat * Math.PI/180;
          const Δφ = (point.lat-latitude) * Math.PI/180;
          const Δλ = (point.lng-longitude) * Math.PI/180;

          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const d = R * c;

          if (d < minDistance) {
              minDistance = d;
              nearestPointBox = point;
          }
          if (d <= targetRadius) {
              isWithinRange = true;
          }
      });

      if (isWithinRange) {
        setStatus('verified');
        try {
          const today = format(new Date(), 'yyyy-MM-dd');
          
          // Check booking
          const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('id')
            .eq('user_id', user.id)
            .eq('date', today)
            .eq('session_id', activeSession.id)
            .maybeSingle();

          if (bookingError || !booking) {
            setMessage(`현재 '${activeSession.name}'에 예약된 내역이 없습니다.`);
            setStatus('error');
            return;
          }

          // Calculate Late status (Start + 10min)
          const startTime = parse(`${today} ${activeSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
          const lateCutoff = addMinutes(startTime, 10);
          
          const now = new Date();
          const finalStatus = isAfter(now, lateCutoff) ? 'late' : 'present';
          const nowKSTISO = getKSTISOString();

          const { error: attError } = await supabase
            .from('attendance')
            .upsert({
              booking_id: booking.id,
              status: finalStatus,
              timestamp_in: nowKSTISO,
              updated_at: new Date().toISOString()
            }, { onConflict: 'booking_id' });

          if (attError) throw attError;

          setMessage(`'${activeSession.name}' 출석 체크가 완료되었습니다! (${finalStatus === 'late' ? '지각' : '출석'})`);
          setTimeout(() => setStatus('done'), 1500);

        } catch (err) {
          console.error(err);
          setMessage('출석 처리 중 오류가 발생했습니다.');
          setStatus('error');
        }
      } else {
        setStatus('error');
        if (accuracy > 1000) {
          setMessage(`위치 정보가 부정확합니다. 스마트폰 GPS를 켜주세요.`);
        } else {
          setMessage(`허용 구역 밖입니다. (${Math.round(minDistance)}m 차이)`);
        }
      }
    }, (error) => {
      setStatus('error');
      setMessage('위치 정보를 가져올 수 없습니다.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const windowInfo = activeSession ? {
    start: format(subMinutes(parse(`${todayStr} ${activeSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date()), 5), 'HH:mm'),
    end: format(addMinutes(parse(`${todayStr} ${activeSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date()), 30), 'HH:mm'),
    lateLimit: format(addMinutes(parse(`${todayStr} ${activeSession.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date()), 10), 'HH:mm')
  } : null;

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
        {activeSession ? (
          <>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ios-indigo/5 text-ios-indigo rounded-full text-[11px] font-black border border-ios-indigo/10">
                <Clock className="w-3.5 h-3.5" />
                현재 '{activeSession.name}' 출석 인증 가능
            </div>
            <h3 className="text-[26px] font-black tracking-tight text-[#1C1C1E] leading-tight">
                {status === 'done' ? '인증 완료' : status === 'locating' ? '위치 확인 중' : '자기 주도 출석'}
            </h3>
            <div className="bg-white rounded-2xl p-4 space-y-1.5 border border-gray-100 shadow-sm">
                <p className="text-[13px] font-bold text-ios-gray">인증 가능 시간: {windowInfo.start} ~ {windowInfo.end}</p>
                <p className="text-[11px] font-black text-ios-rose/80">※ {windowInfo.lateLimit} 이후 인증 시 지각 처리됩니다.</p>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-2xl font-black tracking-tight text-[#1C1C1E]">
                인증 가능한 세션 없음
            </h3>
            <p className="text-sm font-bold text-ios-gray leading-relaxed px-4">
                {loadingSession ? '세션 정보를 불러오고 있습니다...' : '현재 출석 인증 가능 시간이 아닙니다. 시작 5분 전부터 30분 후까지만 가능합니다.'}
            </p>
          </>
        )}
      </div>

      <div className="space-y-4 pt-2">
          {message && (
              <p className={`text-[12px] font-black p-3.5 rounded-apple-md ${status === 'error' ? 'bg-ios-rose/5 text-ios-rose border border-ios-rose/10' : 'bg-ios-emerald/5 text-ios-emerald border border-ios-emerald/10'}`}>
                  {message}
              </p>
          )}

          {status !== 'done' && (
            <button 
              onClick={verifyLocation}
              disabled={status === 'locating' || !activeSession}
              className={`w-full py-[24px] rounded-3xl font-black text-[18px] transition-all shadow-xl ios-tap border ${
                status === 'locating' || !activeSession ? 'bg-white text-gray-300 border-gray-100 shadow-none' :
                status === 'error' ? 'bg-[#1C1C1E] text-white border-transparent' :
                'bg-ios-blue text-white border-transparent shadow-blue-500/20'
              }`}
            >
              {status === 'locating' ? '인증 진행 중...' : activeSession ? `${activeSession.name} 출석 인증하기` : '인증 불가'}
            </button>
          )}
      </div>
    </div>
  );
};

export default AttendanceCheck;

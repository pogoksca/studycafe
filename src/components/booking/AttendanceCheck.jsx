import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

const AttendanceCheck = ({ user }) => {
  const [status, setStatus] = useState('idle'); // idle, locating, verified, error
  const [message, setMessage] = useState('');

  const getKSTISOString = () => {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstTime = new Date(now.getTime() + kstOffset);
    return kstTime.toISOString().replace('Z', '+09:00');
  };

  const verifyLocation = async () => {
    setStatus('locating');
    setMessage('Verifying your location...');

    if (!navigator.geolocation) {
      setStatus('error');
      setMessage('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      // 1. Fetch current sessions to find active one and get zone_id
      const { data: currentSessions } = await supabase
        .from('sessions')
        .select('*');
      
      if (!currentSessions) {
        setStatus('error');
        setMessage('세션 정보를 불러오는 중 오류가 발생했습니다.');
        return;
      }

      const now = new Date();
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                         now.getMinutes().toString().padStart(2, '0') + ':00';
      
      const activeSession = currentSessions.find(s => 
        currentTime >= s.start_time && currentTime <= s.end_time
      );

      if (!activeSession) {
        setMessage('현재는 출석 인증 가능 시간이 아닙니다.');
        setStatus('error');
        return;
      }

      // 2. Fetch Zone Settings for the active session
      const { data: zoneData } = await supabase
        .from('zones')
        .select('settings')
        .eq('id', activeSession.zone_id)
        .single();
      
      const zoneSettings = zoneData?.settings || {};
      // Fallback for legacy or missing data
      const targetPoints = zoneSettings.points || [
          { 
            lat: zoneSettings.latitude || 37.5665, 
            lng: zoneSettings.longitude || 126.9780, 
            name: '기본 지점' 
          }
      ];
      const targetRadius = zoneSettings.radius || 100;

      // 3. Verify Distance against ALL points
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
        
        // --- Actual Attendance Recording Logic ---
        try {

          // 2. Check if student has a booking for today in this session
          const today = now.toISOString().split('T')[0];
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

          // 3. Record attendance
          const startDateTime = new Date(`${today}T${activeSession.start_time}+09:00`);
          const lateCutoff = new Date(startDateTime.getTime() + 10 * 60 * 1000); // 10 minutes grace
          
          const nowKSTISO = getKSTISOString();
          const nowObj = new Date(nowKSTISO);
          
          const isLate = nowObj > lateCutoff;
          const finalStatus = isLate ? 'late' : 'present';

          const { error: attError } = await supabase
            .from('attendance')
            .upsert({
              booking_id: booking.id,
              status: finalStatus,
              timestamp_in: nowKSTISO,
              updated_at: new Date().toISOString()
            }, { onConflict: 'booking_id' });

          if (attError) throw attError;

          setMessage(`'${activeSession.name}' 출석 체크가 완료되었습니다!`);
          setTimeout(() => setStatus('done'), 1500);

        } catch (err) {
          console.error('Attendance recording error:', err);
          setMessage('출석 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
          setStatus('error');
        }
      } else {
        setStatus('error');
        
        // If accuracy is too poor (over 1km), warn the user specifically
        if (accuracy > 1000) {
          setMessage(`위치 정보가 부정확합니다. (오차 범위: ${Math.round(accuracy)}m)
            주로 PC 브라우저나 GPS가 꺼진 환경에서 발생합니다. 
            정확한 인증을 위해 반드시 '스마트폰'의 'GPS'를 켜고 시도해 주세요.`);
        } else {
          setMessage(`허용 구역 밖에 계십니다.
            가장 가까운 '${nearestPointBox?.name || '인증 지점'}'과 약 ${Math.round(minDistance)}m 떨어져 있습니다.
            (허용 반경: ${targetRadius}m)
            
            Tip: 건물 안에서는 GPS 오차가 발생할 수 있으니, 창가 쪽으로 이동하여 다시 시도해 주세요.`);
        }
        
        console.log('GPS Verification Debug:', {
          user: { lat: latitude, lng: longitude, accuracy },
          nearestPoint: nearestPointBox,
          minDistance,
          targetRadius
        });
      }
    }, (error) => {
      setStatus('error');
      setMessage('위치 정보를 가져올 수 없습니다. GPS 권한을 확인해 주세요.');
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  };

  return (
    <div className="ios-glass rounded-ios p-12 max-w-lg w-full text-center space-y-10 relative overflow-hidden animate-spring-up shadow-3xl">
      <div className="absolute top-0 left-0 w-32 h-32 bg-ios-indigo/5 blur-3xl -z-10" />
      
      <div className={`w-24 h-24 rounded-[2rem] mx-auto flex items-center justify-center transition-all duration-700 shadow-inner-white ${
        status === 'verified' || status === 'done' ? 'bg-ios-emerald/20 text-ios-emerald shadow-ios-emerald/20' :
        status === 'error' ? 'bg-ios-rose/20 text-ios-rose shadow-ios-rose/20' :
        status === 'locating' ? 'bg-ios-indigo/20 text-ios-indigo shadow-ios-indigo/20 animate-pulse' :
        'bg-white/5 text-white/30'
      }`}>
        {status === 'done' ? <CheckCircle2 className="w-12 h-12" /> :
         status === 'error' ? <AlertCircle className="w-12 h-12" /> :
         status === 'locating' ? <MapPin className="w-12 h-12" /> :
         <ShieldCheck className="w-12 h-12" />}
      </div>

      <div className="space-y-4">
        <h3 className="text-3xl font-black tracking-tight text-white">
          {status === 'done' ? '출석 인증 완료' : 
           status === 'locating' ? '위치 확인 중' : 
           '자기 주도 출석'}
        </h3>
        <p className="text-ios-gray font-medium text-lg leading-relaxed px-4">
          {message || '청람재 도착을 확인하기 위해 원격 GPS 인증을 시작합니다.'}
        </p>
      </div>

      {status !== 'done' && (
        <button 
          onClick={verifyLocation}
          disabled={status === 'locating'}
          className={`w-full py-6 rounded-2xl font-black text-lg transition-all shadow-2xl ios-tap ${
            status === 'locating' ? 'bg-white/5 text-white/20' :
            status === 'error' ? 'bg-black text-white shadow-black/30' :
            'bg-white text-black'
          }`}
        >
          {status === 'locating' ? '인증 진행 중...' : '지금 위치 인증하기'}
        </button>
      )}
    </div>
  );
};

export default AttendanceCheck;

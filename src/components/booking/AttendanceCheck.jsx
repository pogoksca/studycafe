import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

const AttendanceCheck = ({ user }) => {
  const [status, setStatus] = useState('idle'); // idle, locating, verified, error
  const [message, setMessage] = useState('');

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
      
      // Fetch GPS settings from config
      const { data: config } = await supabase
        .from('configs')
        .select('value')
        .eq('key', 'gps_settings')
        .single();

      if (!config) {
        setStatus('error');
        setMessage('GPS 설정이 구성되지 않았습니다. 관리자에게 문의하세요.');
        return;
      }

      const { lat: targetLat, lng: targetLng, radius } = config.value;

      // Haversine formula to calculate distance
      const R = 6371e3; // metres
      const φ1 = latitude * Math.PI/180;
      const φ2 = targetLat * Math.PI/180;
      const Δφ = (targetLat-latitude) * Math.PI/180;
      const Δλ = (targetLng-longitude) * Math.PI/180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // in metres

      if (distance <= radius) {
        setStatus('verified');
        setMessage('위치가 확인되었습니다! 출석 처리 중...');
        
        // TODO: Record attendance in DB
        setTimeout(() => setStatus('done'), 1500);
      } else {
        setStatus('error');
        
        // If accuracy is too poor (over 1km), warn the user specifically
        if (accuracy > 1000) {
          setMessage(`위치 정보가 부정확합니다. (오차 범위: ${Math.round(accuracy)}m)
            주로 PC 브라우저나 GPS가 꺼진 환경에서 발생합니다. 
            정확한 인증을 위해 반드시 '스마트폰'의 'GPS'를 켜고 시도해 주세요.`);
        } else {
          setMessage(`허용 구역 밖에 계십니다.
            현재 위치와 약 ${Math.round(distance)}m 떨어져 있습니다.
            (허용 반경: ${radius}m)
            
            Tip: 건물 안에서는 GPS 오차가 발생할 수 있으니, 창가 쪽으로 이동하여 다시 시도해 주세요.`);
        }
        
        console.log('GPS Verification Debug:', {
          user: { lat: latitude, lng: longitude, accuracy },
          target: { lat: targetLat, lng: targetLng, radius },
          calculatedDistance: distance
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
            status === 'error' ? 'bg-ios-rose text-white shadow-ios-rose/30' :
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

import React, { useState, useEffect } from 'react';
import { format, addDays, isBefore, startOfDay, parseISO, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const BookingWizard = ({ selectedSeat, onComplete }) => {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd')); // Default to T+2
  const [firstAvailableDate, setFirstAvailableDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [opData, setOpData] = useState({ quarters: [], defaults: [], exceptions: [] });
  const [userDayBookings, setUserDayBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sessionNameMap = {
    'Morning': '조회시간 이전',
    'Dinner': '석식시간 중',
    '1st Period': '1차시',
    '2nd Period': '2차시'
  };

  const getSessionName = (name) => sessionNameMap[name] || name;

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          setCurrentUser(profile);
      }

      const [sData, qData, dData, eData] = await Promise.all([
        supabase.from('sessions').select('*').order('id', { ascending: true }),
        supabase.from('operation_quarters').select('*'),
        supabase.from('operation_defaults').select('*'),
        supabase.from('operation_exceptions').select('*')
      ]);

      if (sData.data) setSessions(sData.data);
      const quarters = qData.data || [];
      const defaults = dData.data || [];
      const exceptions = eData.data || [];

      setOpData({
        quarters,
        defaults,
        exceptions
      });

      // Find first valid operating date starting from T+2
      let checkDate = startOfDay(addDays(new Date(), 2));
      let found = false;
      let iterations = 0;
      const maxSearchDays = 90; // Search up to 3 months ahead

      while (!found && iterations < maxSearchDays) {
          const dStr = format(checkDate, 'yyyy-MM-dd');
          
          // Check if testDate is in any quarter
          const isInQuarter = quarters.some(q => 
              q.start_date && q.end_date && 
              isWithinInterval(checkDate, { 
                  start: parseISO(q.start_date), 
                  end: parseISO(q.end_date) 
              })
          );

          // Check if testDate is an exception (holiday)
          const isHoliday = exceptions.some(e => e.exception_date === dStr);

          // Check if testDate has operating periods
          const dayOfWeek = checkDate.getDay();
          const dayDefault = defaults.find(def => def.day_of_week === dayOfWeek);
          const hasPeriods = dayDefault && (dayDefault.morning || dayDefault.dinner || dayDefault.period1 || dayDefault.period2);

          if (isInQuarter && !isHoliday && hasPeriods) {
              setDate(dStr);
              setFirstAvailableDate(dStr);
              found = true;
          } else {
              checkDate = addDays(checkDate, 1);
              iterations++;
          }
      }

      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (currentUser && date) {
        fetchUserDayBookings();
    }
    setSelectedSessions([]); // Reset selection when date changes
  }, [currentUser, date]);

  const fetchUserDayBookings = async () => {
      const { data } = await supabase
          .from('bookings')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('date', date);
      setUserDayBookings(data || []);
  };

  const isDateOperating = (d) => {
    const targetDate = parseISO(d);
    
    // 0. Check T-2 Policy (2 days in advance)
    const minAllowed = startOfDay(addDays(new Date(), 2));
    if (isBefore(targetDate, minAllowed)) {
        return { ok: false, msg: `예약은 오늘 기준 2일 전까지만 가능합니다. (가능 날짜: ${format(minAllowed, 'M월 d일')}~)` };
    }

    // 1. Check Quarters
    const isInQuarter = opData.quarters.some(q => 
        q.start_date && q.end_date && 
        isWithinInterval(targetDate, { 
            start: parseISO(q.start_date), 
            end: parseISO(q.end_date) 
        })
    );
    if (!isInQuarter) return { ok: false, msg: '선택한 날짜는 청람재 운영일이 아닙니다.' };

    // 2. Check Exceptions
    const exception = opData.exceptions.find(e => e.exception_date === d);
    if (exception) return { ok: false, msg: `휴무일: ${exception.reason}` };

    // 3. Check Defaults (At least one period active)
    const dayOfWeek = targetDate.getDay();
    const dayDefault = opData.defaults.find(def => def.day_of_week === dayOfWeek);
    const hasAnyPeriod = dayDefault && (dayDefault.morning || dayDefault.dinner || dayDefault.period1 || dayDefault.period2);
    if (!hasAnyPeriod) return { ok: false, msg: '해당 요일은 운영하지 않습니다.' };

    return { ok: true };
  };

  const handleNext = () => {
    if (step === 1) {
        const check = isDateOperating(date);
        if (!check.ok) {
            setError(check.msg);
            return;
        }
        
        // Seat Consistency Check: if already booked today, must be the same seat
        if (userDayBookings.length > 0) {
            const existingSeatId = userDayBookings[0].seat_id;
            if (existingSeatId !== selectedSeat.id) {
                setError(`오늘 이미 ${userDayBookings[0].seat_number}번 좌석을 예약하셨습니다. 같은 날에는 자리를 바꿀 수 없습니다.`);
                return;
            }
        }
    }
    setError('');
    setStep(prev => prev + 1);
  };

  const toggleSession = (session) => {
    setSelectedSessions(prev => {
        const exists = prev.find(s => s.id === session.id);
        if (exists) {
            return prev.filter(s => s.id !== session.id);
        } else {
            return [...prev, session].sort((a, b) => a.id - b.id);
        }
    });
  };

  const handleBooking = async () => {
    if (selectedSessions.length === 0) return;
    setLoading(true);
    
    const bookingsToInsert = selectedSessions.map(session => ({
        user_id: currentUser.id,
        seat_id: selectedSeat.id,
        session_id: session.id,
        date: date
    }));

    const { error: bookingError } = await supabase.from('bookings').insert(bookingsToInsert);

    if (bookingError) {
        alert('예약 처리 중 오류가 발생했습니다.');
    } else {
        alert(`예약이 완료되었습니다.\n${date}\n교시: ${selectedSessions.map(s => s.name).join(', ')}\n좌석: ${selectedSeat.display_number || selectedSeat.seat_number}번`);
        onComplete();
    }
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-100 border-b-0 rounded-t-[6px] rounded-b-none pt-[10px] px-6 pb-6 lg:px-8 lg:pb-8 space-y-5 animate-spring-up overflow-hidden relative h-full">
      <div className="absolute top-0 right-0 w-24 h-24 bg-ios-indigo/5 blur-2xl -z-10" />
      
      {/* Selected Seat Info - Relocated to Top */}
      <div className="bg-gray-50/50 rounded-[6px] mt-[10px] pt-4 px-4 pb-4 flex items-center gap-4 border border-gray-100">
        <div className="w-12 h-12 rounded-[6px] bg-white text-[#000000] flex items-center justify-center font-black text-sm border border-gray-200 shadow-sm">
          {selectedSeat.display_number || selectedSeat.seat_number}
        </div>
        <div>
          <p className="text-[9px] font-black text-[#000000] uppercase tracking-[0.2em] mb-0.5 opacity-50">현재 선택된 좌석</p>
          <p className="text-base font-black text-[#1C1C1E]">Zone {selectedSeat.zone_name}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-700 ${
            step >= i ? 'bg-[#1C1C1E]' : 'bg-gray-100'
          }`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[6px] bg-ios-indigo/10 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-ios-indigo" />
            </div>
            <h3 className="text-xl font-black tracking-tight text-[#1C1C1E]">희망 날짜 선택</h3>
          </div>
          
          <div className="space-y-3">
            <input 
              type="date" 
              value={date}
              min={format(addDays(new Date(), 2), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-[6px] p-4 text-lg focus:ring-1 focus:ring-ios-indigo transition-all font-black text-[#1C1C1E]"
            />
            <div className="bg-amber-50 p-5 rounded-[6px] border border-amber-100">
              <p className="font-black text-ios-amber text-[9px] mb-1 uppercase tracking-widest flex items-center gap-1.5">
                <Check className="w-2.5 h-2.5" /> T-2 정책 안내
              </p>
              <p className="text-amber-900/70 text-xs leading-relaxed font-medium">
                안정적인 학습 환경을 위해 예약은 2일 전까지만 가능합니다.<br/>
                <span className="text-amber-900 font-bold">오늘 예약 가능 날짜: {format(parseISO(firstAvailableDate), 'M월 d일')} 이후</span>
              </p>
            </div>
          </div>
          
          {error && (
              <div className="p-4 bg-ios-rose/5 border border-ios-rose/10 rounded-[6px] flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 text-ios-rose" />
                  <p className="text-[11px] font-black text-ios-rose">{error}</p>
              </div>
          )}

          <div className="flex gap-2">
            <button 
              onClick={() => onComplete()} 
              className="flex-1 bg-gray-100 text-[#1C1C1E] py-4 rounded-[6px] font-black text-xs transition-all hover:bg-gray-200 ios-tap"
            >
              취소
            </button>
            <button onClick={handleNext} className="flex-[3] bg-[#1C1C1E] text-white py-4 rounded-[6px] font-black text-xs transition-all shadow-md ios-tap">
              다음 단계로 계속
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[6px] bg-ios-indigo/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-ios-indigo" />
            </div>
            <h3 className="text-xl font-black tracking-tight text-[#1C1C1E]">학습 교시 선택</h3>
          </div>
          
          <p className="text-[11px] font-black text-ios-gray px-1">가고 싶은 모든 교시를 자유롭게 선택해 주세요. (중복 선택 가능)</p>

          <div className="grid grid-cols-1 gap-3">
            {sessions.map(s => {
                const dayOfWeek = parseISO(date).getDay();
                const dayDefault = opData.defaults.find(def => def.day_of_week === dayOfWeek);
                const isOp = 
                    s.id === 1 ? dayDefault?.morning :
                    s.id === 2 ? dayDefault?.dinner :
                    s.id === 3 ? dayDefault?.period1 :
                    s.id === 4 ? dayDefault?.period2 : false;
                
                const isAlreadyBooked = userDayBookings.some(b => b.session_id === s.id);
                const isSelected = selectedSessions.some(sel => sel.id === s.id);

                if (!isOp) return null;

                return (
                    <button
                        key={s.id}
                        disabled={isAlreadyBooked}
                        onClick={() => toggleSession(s)}
                        className={`p-4 rounded-[6px] border transition-all duration-300 flex items-center justify-between group ios-tap text-left ${
                        isSelected 
                            ? 'border-[#1C1C1E] bg-[#1C1C1E]/5 shadow-sm' 
                            : isAlreadyBooked ? 'opacity-40 bg-gray-100 cursor-not-allowed' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                    >
                        <div className="flex-1 flex flex-col items-start">
                        <div className="flex items-center gap-2">
                            <p className="font-black text-base text-[#1C1C1E]">{getSessionName(s.name)}</p>
                            {isAlreadyBooked && <span className="text-[9px] font-black text-ios-gray bg-gray-200 px-1.5 py-0.5 rounded-full uppercase">이미 예약됨</span>}
                        </div>
                        <p className="text-[10px] font-black text-ios-gray/70 uppercase tracking-tight mt-0.5">
                            {s.start_time.slice(0,5)} ~ {s.end_time.slice(0,5)}
                        </p>
                        </div>
                        {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-[#1C1C1E] flex items-center justify-center shadow-sm">
                            <Check className="w-3 h-3 text-white stroke-[3px]" />
                        </div>
                        ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-white" />
                        )}
                    </button>
                );
            })}
          </div>
          
          {error && (
              <div className="p-4 bg-ios-rose/5 border border-ios-rose/10 rounded-[6px] flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 text-ios-rose" />
                  <p className="text-[11px] font-black text-ios-rose">{error}</p>
              </div>
          )}

          <div className="flex gap-2">
            <button 
                onClick={() => onComplete()} 
                className="px-6 bg-gray-100 text-[#1C1C1E] py-4 rounded-[6px] font-black text-xs transition-all hover:bg-gray-200 ios-tap"
            >
                취소
            </button>
            <button 
                onClick={() => setStep(1)} 
                className="flex-1 py-4 bg-gray-100 text-ios-gray rounded-[6px] font-black text-xs ios-tap"
            >
                이전으로
            </button>
            <button 
                disabled={selectedSessions.length === 0}
                onClick={handleNext} 
                className="flex-[2] bg-[#1C1C1E] text-white py-4 rounded-[6px] font-black text-xs transition-all shadow-md disabled:opacity-20 ios-tap"
            >
                {selectedSessions.length}개 선택함 — 다음으로
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-[6px] bg-emerald-50 text-ios-emerald flex items-center justify-center mx-auto border border-emerald-100">
              <Check className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-2xl font-black tracking-tight text-[#1C1C1E]">최종 확인</h3>
              <p className="text-xs text-ios-gray font-medium">선택하신 내용을 마지막으로 확인해 주세요.</p>
            </div>
          </div>
          
          <div className="space-y-1.5">
            {[
              { label: '예약 날짜', value: format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko }), color: 'text-[#1C1C1E]' },
              { label: '선택 교시', value: selectedSessions.map(s => getSessionName(s.name)).join(', '), color: 'text-[#1C1C1E]' },
              { label: '좌석 번호', value: `${selectedSeat.seat_number}번`, color: 'text-[#1C1C1E]' },
              { label: '배정 구역', value: selectedSeat.zone_name, color: 'text-[#1C1C1E]' },
            ].map((row, idx) => (
              <div key={idx} className="flex justify-between items-center p-4 rounded-[6px] bg-gray-50 border border-gray-100">
                <span className="text-[9px] font-black text-ios-gray uppercase tracking-widest leading-none">{row.label}</span>
                <span className={`text-sm font-black text-right max-w-[200px] ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => onComplete()}
              className="flex-1 bg-gray-100 text-[#1C1C1E] py-5 rounded-[6px] font-black text-base transition-all hover:bg-gray-200 ios-tap"
            >
              취소
            </button>
            <button 
              disabled={loading}
              onClick={handleBooking} 
              className="flex-[2] bg-[#1C1C1E] text-white py-5 rounded-[6px] font-black text-base transition-all shadow-lg shadow-black/20 flex items-center justify-center gap-3 ios-tap overflow-hidden relative group disabled:opacity-50"
            >
              {loading ? '처리 중...' : '예약 확정하기'} <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingWizard;

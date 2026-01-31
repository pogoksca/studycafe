import React, { useState, useEffect } from 'react';
import { 
  format, 
  addDays, 
  isBefore, 
  startOfDay, 
  parseISO, 
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  getDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  Clock,
  Check,
  AlertCircle,
  MapPin,
  Calendar as CalendarIcon,
  User,
  Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const BookingWizard = ({ selectedSeat, onComplete, targetUser, loggedInUser, initialDate, onDateChange, currentZoneId }) => {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(initialDate || format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [firstAvailableDate, setFirstAvailableDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [authUser, setAuthUser] = useState(null); // The actual logged-in user
  const [opData, setOpData] = useState({ quarters: [], exceptions: [], operatingRules: [] });
  const [userDayBookings, setUserDayBookings] = useState([]);
  const [seatDayBookings, setSeatDayBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sync date when initialDate changes (e.g. from map)
  useEffect(() => {
    if (initialDate) {
      setDate(initialDate);
    }
  }, [initialDate]);

  const sessionNameMap = {
    'Morning': '조회시간 이전',
    'Dinner': '석식시간 중',
    '1st Period': '1차시',
    '2nd Period': '2차시'
  };

  const getSessionName = (name) => sessionNameMap[name] || name;

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          setCurrentUser(targetUser || profile);
          setAuthUser(profile);
      }

      // We need a zone_id for opData. If no seat, use the currentZoneId from props.
      const effectiveZoneId = selectedSeat?.zone_id || currentZoneId;

      if (effectiveZoneId) {
        setLoading(true);
        const [sData, qData, dData, eData, configData] = await Promise.all([
          supabase.from('sessions').select('*').eq('zone_id', effectiveZoneId).order('start_time', { ascending: true }),
          supabase.from('operation_quarters').select('*'),
          supabase.from('operation_defaults').select('*').eq('zone_id', effectiveZoneId),
          supabase.from('operation_exceptions').select('*').eq('zone_id', effectiveZoneId),
          supabase.from('configs').select('*').eq('key', `zone_op_config_${effectiveZoneId}`).single()
        ]);

        if (sData.data) setSessions(sData.data);
        
        // Fetch operating rules from session_operating_days
        const { data: rulesData } = await supabase
          .from('session_operating_days')
          .select('session_id, day_of_week')
          .in('session_id', (sData.data || []).map(s => s.id))
          .eq('is_active', true);

        setOpData({
          quarters: qData.data || [],
          exceptions: eData.data || [],
          operatingRules: rulesData || []
        });

        setLoading(false);
      } else {
        // Fetch global quarters if no zone is known yet
        const { data: qData } = await supabase.from('operation_quarters').select('*');
        setOpData(prev => ({ ...prev, quarters: qData || [] }));
      }
    };
    init();
  }, [selectedSeat, currentZoneId, targetUser]); // Added targetUser to trigger re-init if needed

  // NEW: Reactively sync currentUser when targetUser or authUser changes
  useEffect(() => {
    setCurrentUser(targetUser || authUser);
  }, [targetUser, authUser]);

  useEffect(() => {
    if (currentUser && date && selectedSeat) {
        fetchUserDayBookings();
        fetchSeatDayBookings();
    }
    setSelectedSessions([]); // Reset selection when date changes
  }, [currentUser, date, selectedSeat, currentZoneId]);

  const fetchUserDayBookings = async () => {
      const { data } = await supabase
          .from('bookings')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('date', date);
      setUserDayBookings(data || []);
  };

  const fetchSeatDayBookings = async () => {
      if (!selectedSeat) return;
      const { data } = await supabase
          .from('bookings')
          .select('*, profiles(username, full_name)')
          .eq('seat_id', selectedSeat.id)
          .eq('date', date);
      setSeatDayBookings(data || []);
  };

  const isDateOperating = (d) => {
    const targetDate = parseISO(d);
    const effectiveUser = loggedInUser || authUser;
    const isPrivileged = effectiveUser && ['admin', 'teacher'].includes(effectiveUser.role);
    const minAllowed = startOfDay(addDays(new Date(), isPrivileged ? 0 : 2));

    if (isBefore(targetDate, minAllowed)) {
         return { ok: false, msg: `예약은 오늘 기준 ${isPrivileged ? '0' : '2'}일 전까지만 가능합니다.` };
    }

    if (opData.quarters.length > 0) {
      const isInQuarter = opData.quarters.some(q =>
          q.start_date && q.end_date &&
          isWithinInterval(targetDate, {
              start: parseISO(q.start_date),
              end: parseISO(q.end_date)
          })
      );
      if (!isInQuarter) return { ok: false, msg: '선택한 날짜는 운영 기간이 아닙니다.' };
    }

    const exception = opData.exceptions.find(e => e.exception_date === d);
    if (exception) return { ok: false, msg: `휴무일: ${exception.reason}` };

    if (opData.operatingRules.length > 0) {
      const dayOfWeek = targetDate.getDay();
      const hasAnyPeriod = opData.operatingRules.some(r => r.day_of_week === dayOfWeek);
      if (!hasAnyPeriod) return { ok: false, msg: '해당 요일은 운영하지 않습니다.' };
    }

    return { ok: true };
  };

  const handleNext = () => {
    if (step === 1) {
        // Enforce proxy booking for Staff
        const effectiveUser = loggedInUser || authUser;
        if (effectiveUser && ['admin', 'teacher'].includes(effectiveUser.role) && !targetUser) {
            setError('관리자/교사는 본인 명의로 예약할 수 없습니다. 상단에서 학생을 먼저 검색해 주세요.');
            return;
        }

        const check = isDateOperating(date);
        if (!check.ok) {
            setError(check.msg);
            return;
        }

        if (userDayBookings.length > 0 && selectedSeat) {
            const existingSeatId = userDayBookings[0].seat_id;
            if (existingSeatId !== selectedSeat.id) {
                setError(`오늘 이미 ${userDayBookings[0].seat_number}번 좌석을 예약하셨습니다.`);
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

    async function handleCancelBooking(e, session_id) {
        e.stopPropagation();
        if (!window.confirm('해당 예약을 정말로 취소하시겠습니까?')) return;
        try {
            setLoading(true);
            const { error: deleteError } = await supabase
                .from('bookings')
                .delete()
                .eq('seat_id', selectedSeat.id)
                .eq('date', date)
                .eq('session_id', session_id);
            if (deleteError) throw deleteError;
            setSeatDayBookings(prev => prev.filter(b => b.session_id !== session_id));
            setUserDayBookings(prev => prev.filter(b => b.session_id !== session_id));
            alert('예약이 취소되었습니다.');
        } catch (err) {
            console.error('Cancel Error:', err);
            setError(`예약 취소 중 오류 발생: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

  async function handleBooking() {
    if (selectedSessions.length === 0 || loading) return;

    // Final safety check for Staff
    const effectiveAuthUser = loggedInUser || authUser;
    if (effectiveAuthUser && ['admin', 'teacher'].includes(effectiveAuthUser.role) && !targetUser) {
        setError('관리자/교사는 본인 명의로 예약할 수 없습니다.');
        setStep(1);
        return;
    }

    // Helper for KST Timestamp
    const getKSTISOString = () => {
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstTime = new Date(now.getTime() + kstOffset);
        return kstTime.toISOString().replace('Z', '+09:00');
    };

    setLoading(true);
    try {
        const { data: currentBookings } = await supabase
            .from('bookings')
            .select('session_id, user_id, seat_id')
            .eq('date', date)
            .in('session_id', selectedSessions.map(s => s.id));

        if (currentBookings && currentBookings.length > 0) {
            const seatConflict = currentBookings.some(b => b.seat_id === selectedSeat.id);
            const userConflict = currentBookings.some(b => b.user_id === currentUser.id);
            if (seatConflict || userConflict) {
                setError(seatConflict ? '이미 다른 예약이 발생했습니다.' : '해당 학생은 이미 다른 예약을 보유 중입니다.');
                setStep(2);
                setLoading(false);
                fetchUserDayBookings();
                fetchSeatDayBookings();
                return;
            }
        }
        const bookingsToInsert = selectedSessions.map(session => ({
            user_id: currentUser.id,
            seat_id: selectedSeat.id,
            session_id: session.id,
            date: date,
            created_at: getKSTISOString()
        }));
        const { error: bookingError } = await supabase.from('bookings').insert(bookingsToInsert);
        if (bookingError) {
            setError(`오류 발생: ${bookingError.message}`);
            setStep(2);
        } else {
            alert('예약이 완료되었습니다.');
            onComplete();
            window.location.reload();
        }
    } catch (err) {
        setError('예상치 못한 오류 발생');
    } finally {
        setLoading(false);
    }
  }

  const [viewMonth, setViewMonth] = useState(new Date());

  const renderCalendar = () => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 px-1">
          <h4 className="text-sm font-black text-[#1C1C1E]">
            {format(viewMonth, 'yyyy년 M월', { locale: ko })}
          </h4>
          <div className="flex gap-2">
            <button 
                onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-ios-gray" />
            </button>
            <button 
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-ios-gray" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['일', '월', '화', '수', '목', '금', '토'].map(day => (
            <div key={day} className="text-center text-[10px] font-bold text-ios-gray/50 py-1">
              {day}
            </div>
          ))}
          {calendarDays.map((d, i) => {
            const dStr = format(d, 'yyyy-MM-dd');
            const opCheck = isDateOperating(dStr);
            const isSelected = date === dStr;
            const isCurrentMonth = isSameDay(startOfMonth(d), monthStart);
            const isTodayDate = isToday(d);

            return (
              <button
                key={i}
                disabled={!opCheck.ok}
                onClick={() => {
                  setDate(dStr);
                  if (onDateChange) onDateChange(dStr);
                }}
                className={`
                  h-9 w-full rounded-lg flex flex-col items-center justify-center transition-all relative
                  ${isSelected ? 'bg-[#1C1C1E] text-white shadow-md z-10' : ''}
                  ${!isSelected && isCurrentMonth && opCheck.ok ? 'hover:bg-gray-100 text-[#1C1C1E] font-black' : ''}
                  ${!isSelected && opCheck.ok && !isCurrentMonth ? 'text-ios-gray/40 font-black' : ''}
                  ${!opCheck.ok ? 'opacity-20 cursor-not-allowed text-ios-gray grayscale' : ''}
                  ${!isSelected && isTodayDate ? 'border border-ios-indigo text-ios-indigo font-black' : ''}
                `}
              >
                <span className="text-xs">{format(d, 'd')}</span>
              </button>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-4 px-1">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#1C1C1E]/10" />
                <span className="text-[10px] font-bold text-ios-gray/70">운영일</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-ios-indigo/20" />
                <span className="text-[10px] font-bold text-ios-indigo/70">오늘</span>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-100 border-b-0 rounded-t-[6px] rounded-b-none pt-[10px] px-6 pb-6 lg:px-8 lg:pb-8 space-y-5 animate-spring-up overflow-hidden relative h-full">
      <div className="absolute top-0 right-0 w-24 h-24 bg-ios-indigo/5 blur-2xl -z-10" />
      
      {/* Selected Seat Info - Relocated to Top */}
      <div className="bg-gray-50/50 rounded-[6px] mt-[10px] pt-4 px-4 pb-4 flex items-center gap-4 border border-gray-100">
        <div className="w-12 h-12 rounded-[6px] bg-white text-[#000000] flex items-center justify-center font-black text-sm border border-gray-200 shadow-sm">
          {selectedSeat ? (selectedSeat.display_number || selectedSeat.seat_number) : '?'}
        </div>
        <div>
          <p className="text-[9px] font-black text-[#000000] uppercase tracking-[0.2em] mb-0.5 opacity-50">현재 선택된 좌석</p>
          <p className="text-base font-black text-[#1C1C1E]">
            {selectedSeat ? `Zone ${selectedSeat.zone_name}` : '좌석을 선택해 주세요'}
          </p>
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
          
          <div className="space-y-4">
            {renderCalendar()}

            {!isDateOperating(date).ok && (
               <div className="p-4 bg-ios-rose/5 border border-ios-rose/10 rounded-xl flex items-center gap-2 animate-shake">
                   <AlertCircle className="w-4 h-4 text-ios-rose" />
                   <p className="text-[11px] font-black text-ios-rose italic">{isDateOperating(date).msg}</p>
               </div>
            )}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">선택된 날짜</p>
                <p className="text-lg font-black text-[#1C1C1E]">
                    {format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
                </p>
            </div>
          </div>
          
          {error && (
              <div className="p-4 bg-ios-rose/5 border border-ios-rose/10 rounded-[6px] flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 text-ios-rose" />
                  <p className="text-[11px] font-black text-ios-rose">{error}</p>
              </div>
          )}

          {/* Bottom Controls */}
          <div className="mt-8 pt-6 border-t border-gray-50 flex gap-3">
            <button 
              onClick={onComplete}
              className="flex-1 py-3.5 rounded-xl text-sm font-black text-ios-gray bg-gray-50 hover:bg-gray-100 transition-all ios-tap"
            >
              취소
            </button>
            <button 
              disabled={!isDateOperating(date).ok || !selectedSeat}
              onClick={handleNext} 
              className={`flex-[1.5] py-3.5 rounded-xl text-sm font-black text-white transition-all shadow-lg ios-tap ${
                isDateOperating(date).ok && selectedSeat
                  ? 'bg-[#1C1C1E] shadow-black/10 hover:bg-gray-800' 
                  : 'bg-gray-200 cursor-not-allowed shadow-none'
              }`}
            >
              다음 단계로
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
                const isOp = opData.operatingRules.some(r => r.session_id === s.id && r.day_of_week === dayOfWeek);
                
                const isAlreadyBooked = userDayBookings.some(b => b.session_id === s.id);
                const isSeatTaken = seatDayBookings.some(b => b.session_id === s.id);
                const isSelected = selectedSessions.some(sel => sel.id === s.id);

                if (!isOp) return null;

                return (
                    <button
                        key={s.id}
                        disabled={isAlreadyBooked || isSeatTaken}
                        onClick={() => toggleSession(s)}
                        className={`p-4 rounded-[6px] border transition-all duration-300 flex items-center justify-between group ios-tap text-left ${
                        isSelected 
                            ? 'border-[#1C1C1E] bg-[#1C1C1E]/5 shadow-sm' 
                            : (isAlreadyBooked || isSeatTaken) 
                                ? (['admin', 'teacher'].includes(currentUser?.role) ? 'border-red-100 bg-red-50/30' : 'opacity-30 bg-gray-100 cursor-not-allowed')
                                : 'border-gray-100 bg-gray-50/50 hover:bg-gray-100/80'
                        }`}
                    >
                        <div className="flex-1 flex flex-col items-start">
                        <div className="flex items-center gap-2">
                            <p className="font-black text-base text-[#1C1C1E]">{getSessionName(s.name)}</p>
                            {isAlreadyBooked && <span className="text-[9px] font-black text-ios-gray bg-gray-200 px-1.5 py-0.5 rounded-full uppercase">이미 예약됨</span>}
                            {!isAlreadyBooked && isSeatTaken && (
                                <div className="flex flex-col items-start gap-1">
                                    <span className="text-[9px] font-black text-ios-rose bg-ios-rose/10 px-1.5 py-0.5 rounded-full uppercase">좌석 점유됨</span>
                                    {['admin', 'teacher'].includes(authUser?.role) && seatDayBookings.find(b => b.session_id === s.id)?.profiles && (
                                        <span className="text-[9px] font-bold text-ios-rose/70">
                                            {seatDayBookings.find(b => b.session_id === s.id).profiles.username} {seatDayBookings.find(b => b.session_id === s.id).profiles.full_name}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] font-black text-ios-gray/70 uppercase tracking-tight mt-0.5">
                            {s.start_time.slice(0,5)} ~ {s.end_time.slice(0,5)}
                        </p>
                        </div>
                        {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-[#1C1C1E] flex items-center justify-center shadow-sm">
                            <Check className="w-3 h-3 text-white stroke-[3px]" />
                        </div>
                        ) : (isAlreadyBooked || isSeatTaken) && ['admin', 'teacher'].includes(currentUser.role) ? (
                        <button
                            onClick={(e) => handleCancelBooking(e, s.id)}
                            className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-all group/btn border border-red-200"
                            title="예약 취소"
                        >
                            <Trash2 className="w-4 h-4 text-red-500 group-hover/btn:scale-110 transition-transform" />
                        </button>
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
                className="flex-1 bg-gray-100 text-[#1C1C1E] py-4 rounded-[6px] font-black text-xs transition-all hover:bg-gray-200 ios-tap"
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
                className="flex-[2] bg-[#1C1C1E] text-white py-4 rounded-[6px] font-black text-xs transition-all shadow-md disabled:opacity-20 ios-tap flex flex-col items-center justify-center leading-tight"
            >
                <span>{selectedSessions.length}개 선택함</span>
                <span className="opacity-60 text-[10px] mt-0.5">다음으로</span>
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
              { label: '배정 구역', value: selectedSeat.zone_name, color: 'text-[#1C1C1E]' },
              { label: '좌석 번호', value: `${selectedSeat.seat_number}번`, color: 'text-[#1C1C1E]' },
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

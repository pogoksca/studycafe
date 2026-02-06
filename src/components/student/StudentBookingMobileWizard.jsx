import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Calendar, Clock, MapPin, Armchair, BookOpen, Save, 
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, X,
  ChevronUp, ChevronDown, Info
} from 'lucide-react';
import { format, addDays, subDays, isBefore, isAfter, parseISO, startOfDay, isSameDay, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import SeatMapModal from '../booking/SeatMapModal';

const StudentBookingMobileWizard = ({ onCancel, onSuccess, currentUser }) => {
  const [currentStep, setCurrentStep] = useState(0); // 0: Date, 1: Session, 2: Zone, 3: Seat, 4: Content, 5: Review
  const [loading, setLoading] = useState(false); // Global loading for fetch/submit
  const [quarters, setQuarters] = useState([]);
  const [operationalSessions, setOperationalSessions] = useState([]);
  const [zones, setZones] = useState([]);
  const [userActivities, setUserActivities] = useState({}); // { 'yyyy-MM-dd': status }
  
  // Booking Data State
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [selectedSeatNumber, setSelectedSeatNumber] = useState('');
  const [selectedSection, setSelectedSection] = useState('A'); // Default section
  const [studyContent, setStudyContent] = useState({}); // Changed to Object: { [sessionId]: string }
  const [restrictionSettings, setRestrictionSettings] = useState({ enabled: false, restrictions: {} });

  // Management State
  const [manageDate, setManageDate] = useState(null);
  const [dailyBookings, setDailyBookings] = useState({}); // { 'yyyy-MM-dd': [bookings...] }
  const [editingBookingIds, setEditingBookingIds] = useState(null); // List of IDs being edited

  // Helper: Get clean seat number (strip section prefix)
  const getCleanSeatNumber = (seat) => {
      if (!seat) return '';
      const rawNum = seat.seat_number.toString();
      const section = seat.zone_name || '';
      
      // Remove Section + Hyphen (e.g. "A-24" -> "24")
      if (section && rawNum.startsWith(`${section}-`)) {
          return rawNum.replace(`${section}-`, '');
      }
      // Remove Section only (e.g. "A24" -> "24")
      if (section && rawNum.startsWith(section)) {
          return rawNum.replace(section, '');
      }
      return rawNum;
  };

  // Operation Rules State
  const [operatingRules, setOperatingRules] = useState([]);
  const [operationExceptions, setOperationExceptions] = useState([]);
  const [zoneSeats, setZoneSeats] = useState([]);

  // Modal State
  const [showSeatMap, setShowSeatMap] = useState(false);

  // --- Initial Data Fetch ---
  useEffect(() => {
    const fetchConfigs = async () => {
      setLoading(true);
      try {
        // 1. Quarters
        const { data: qData } = await supabase
            .from('operation_quarters') // Corrected table name
            .select('*')
            .order('start_date');
        setQuarters(qData || []);

        // 2. Zones
        const { data: zData } = await supabase
            .from('zones')
            .select('*')
            .order('created_at');
        setZones(zData || []);
        
        // Setup initial selected zone and fetch its rules
        let initialZoneId = null;
        if (zData && zData.length > 0) {
            initialZoneId = zData[0].id;
            setSelectedZoneId(initialZoneId);
        }

        // 3. Grade Restriction Configs
        const [configRes, restrRes] = await Promise.all([
          supabase.from('configs').select('value').eq('key', 'grade_restriction_enabled').maybeSingle(),
          supabase.from('configs').select('value').eq('key', 'sub_zone_grade_restrictions').maybeSingle()
        ]);
        
        setRestrictionSettings({
          enabled: !!configRes.data?.value,
          restrictions: restrRes.data?.value || {}
        });

        // (Sessions and Rules will be fetched via useEffect when selectedZoneId is set)

      } catch (err) {
        console.error("Error fetching wizard configs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, []);

  // --- Zone-Specific Data Fetch ---
  useEffect(() => {
    if (!selectedZoneId) return;
    
    const fetchZoneData = async () => {
        setLoading(true);
        try {
            // Parallel Fetch: Sessions, Exceptions, AND Seats for this Zone
            const [sRes, eRes, seatsRes] = await Promise.all([
                 supabase.from('sessions')
                    .select('*')
                    .eq('zone_id', selectedZoneId)
                    .order('start_time'),
                 supabase.from('operation_exceptions')
                    .select('*')
                    .eq('zone_id', selectedZoneId),
                 supabase.from('seats')
                    .select('*')
                    .eq('zone_id', selectedZoneId)
                    .order('global_number')
            ]);

            setOperationalSessions(sRes.data || []);
            setOperationExceptions(eRes.data || []);
            setZoneSeats(seatsRes.data || []);
            
            // Fetch operating rules from session_operating_days
            const { data: rulesData } = await supabase
                .from('session_operating_days')
                .select('session_id, day_of_week')
                .in('session_id', (sRes.data || []).map(s => s.id))
                .eq('is_active', true);
            
            setOperatingRules(rulesData || []);
            
            // Auto-detect initial section if possible
            const seats = seatsRes.data || [];
            if (seats.length > 0) {
                // Use explicit zone_name for Section. If no sub-zones, use empty string.
                const firstSection = seats[0].zone_name || '';
                setSelectedSection(firstSection);
            }

            // Clear prior session and seat selection as IDs/Layout differ between zones
            setSelectedSessionIds([]); 
            setSelectedSeatNumber('');

        } catch (err) {
            console.error("Error fetching zone data:", err);
        } finally {
            setLoading(false);
        }
    };
    
    fetchZoneData();
  }, [selectedZoneId]);

  // --- User Activity Fetch (for Calendar) ---
  useEffect(() => {
    if (!currentUser) return;
    
    const fetchUserActivities = async () => {
        try {
            const { data: bookings } = await supabase
                .from('bookings')
                .select(`
                    *,
                    sessions (id, name, start_time, end_time),
                    seats (id, seat_number, zone_name, zone_id, zones(name)),
                    attendance (
                        status
                    )
                `)
                .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`);
            
            if (bookings) {
                const activityMap = {};
                const bookingMap = {};
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                
                bookings.forEach(b => {
                    const d = b.date;
                    
                    // Populate Booking Map
                    if (!bookingMap[d]) bookingMap[d] = [];
                    bookingMap[d].push(b);

                    const att = b.attendance && b.attendance[0];
                    
                    let status = 'reserved';
                    if (d < todayStr) {
                        if (att) {
                            if (att.status === 'present') status = 'present';
                            else if (att.status === 'late') status = 'late';
                            else status = 'absent';
                        } else {
                            status = 'absent';
                        }
                    } else if (d === todayStr) {
                        // For today, if already attended, show it
                        if (att) {
                            if (att.status === 'present') status = 'present';
                            else if (att.status === 'late') status = 'late';
                        }
                    }
                    
                    // Prioritize positive statuses if multiple bookings exist for a day
                    if (!activityMap[d] || 
                        (status === 'present' && activityMap[d] !== 'present') ||
                        (status === 'late' && activityMap[d] === 'absent')) {
                        activityMap[d] = status;
                    }
                });
                setUserActivities(activityMap);
                setDailyBookings(bookingMap);
            }
        } catch (err) {
            console.error("Error fetching user activities:", err);
        }
    };
    
    fetchUserActivities();
  }, [currentUser]);

  // --- Helper: Date Logic ---
  const isDateBookable = (date) => {
    const today = startOfDay(new Date());
    const target = startOfDay(date);
    
    // Rule B: Deadline (Target must be at least Today + 2)
    // "2월 5일은... 2월 3일까지 예약 가능" -> Today must be <= Target - 2
    // Calc: Target >= Today + 2
    const minDate = addDays(today, 2);
    if (isBefore(target, minDate)) return false;

    // Rule A: Quarter Open (Quarter must be open 7 days before start)
    // Find if Target belongs to any Quarter
    const targetQuarter = quarters.find(q => {
        const start = parseISO(q.start_date);
        const end = parseISO(q.end_date);
        return (isSameDay(target, start) || isAfter(target, start)) && 
               (isSameDay(target, end) || isBefore(target, end));
    });

    if (!targetQuarter) return false; // Not in any active quarter

    // Check if Booking is Open for this Quarter
    // OpenDate = Quarter.start - 7
    const qStart = parseISO(targetQuarter.start_date);
    const openDate = subDays(qStart, 7);
    
    // Actual Logic: Today must be >= OpenDate
    if (isBefore(today, openDate)) return false;

    // Rule C: Exceptions (Holiday?)
    const dateStr = format(target, 'yyyy-MM-dd');
    const exception = operationExceptions.find(e => e.exception_date === dateStr);
    if (exception && exception.is_closed) return false;

    // Rule D: Weekly Defaults (Open this day?)
    const dayOfWeek = target.getDay(); // 0-6
    const hasAnyPeriod = operatingRules.some(r => r.day_of_week === dayOfWeek);
    if (!hasAnyPeriod) return false;

    return true;
  };

  // --- Render Steps ---
  
  // Step 1: Date
  const [viewDate, setViewDate] = useState(new Date()); // Tracks the month being viewed

  const handlePrevMonth = () => setViewDate(d => subMonths(d, 1));
  const handleNextMonth = () => setViewDate(d => addMonths(d, 1));

  const renderDateStep = () => {
    // Calendar Grid Logic
    const monthStart = startOfDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
    const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const startDate = startOfDay(monthStart);
    
    const dayOfWeek = startDate.getDay(); // 0(Sun) to 6(Sat)
    
    // Create grid slots taking starting empty days into account
    const emptySlots = Array(dayOfWeek).fill(null);
    const daysInMonth = [];
    for (let d = 1; d <= monthEnd.getDate(); d++) {
        daysInMonth.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), d));
    }

    const calendarGrid = [...emptySlots, ...daysInMonth];

    return (
        <div className="space-y-4 animate-fade-in">
            <h3 className="text-xl font-black text-[#1C1C1E]">날짜 선택</h3>
            <p className="text-sm font-bold text-ios-gray">예약할 날짜를 선택해주세요.</p>

            {/* Month Navigation */}
            <div className="flex items-center justify-between bg-white rounded-2xl p-2 shadow-sm border border-gray-100 mb-4">
                <button 
                    onClick={handlePrevMonth}
                    className="p-2 hover:bg-gray-100 rounded-full text-ios-gray hover:text-black transition-colors"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-base font-black text-[#1C1C1E]">
                    {format(viewDate, 'yyyy년 M월')}
                </span>
                <button 
                     onClick={handleNextMonth}
                    className="p-2 hover:bg-gray-100 rounded-full text-ios-gray hover:text-black transition-colors"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
            
            <div className="grid grid-cols-7 gap-2">
                {['일','월','화','수','목','금','토'].map((d, i) => (
                    <div key={d} className={`text-center text-xs font-bold py-2 ${i === 0 || i === 6 ? 'text-ios-rose' : 'text-gray-400'}`}>{d}</div>
                ))}
                
                {calendarGrid.map((date, idx) => {
                    if (!date) {
                        return <div key={`empty-${idx}`} />;
                    }
                    
                    const available = isDateBookable(date);
                    const isSelected = selectedDate && isSameDay(date, selectedDate);
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const activity = userActivities[dateStr];
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isException = operationExceptions.some(e => e.exception_date === dateStr);
                    const isHoliday = isWeekend || isException;
                    
                    return (
                        <button
                            key={idx}
                            disabled={!available && !activity}
                            onClick={() => {
                                if (activity) {
                                    setManageDate(date);
                                } else if (available) {
                                    setSelectedDate(date);
                                }
                            }}
                            className={`
                                aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all relative
                                ${isSelected 
                                    ? 'bg-ios-indigo text-white shadow-xl scale-105 z-10' 
                                    : activity === 'present' ? 'bg-ios-emerald text-white border-none' :
                                      activity === 'late' ? 'bg-ios-amber text-white border-none' :
                                      activity === 'absent' ? 'bg-ios-rose text-white border-none' :
                                      activity === 'reserved' ? 'bg-ios-indigo text-white border-none' :
                                      available 
                                        ? `bg-white border border-gray-100 hover:border-gray-300 ${isHoliday ? 'text-ios-rose' : 'text-[#1C1C1E]'}` 
                                        : `bg-transparent cursor-not-allowed ${isHoliday ? 'text-ios-rose/50' : 'text-gray-400'}` 
                                }
                            `}
                        >
                            <span className={!available && !activity ? 'opacity-50' : ''}>{format(date, 'd')}</span>
                        </button>
                    );
                })}
            </div>

            {/* Activity Legend */}
            <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex flex-col gap-3">
                    <span className="text-[11px] font-black text-ios-gray uppercase tracking-[0.2em]">활동 지표</span>
                    <div className="flex flex-wrap gap-4">
                        {[
                            { label: '출석', color: 'bg-ios-emerald' },
                            { label: '지각', color: 'bg-ios-amber' },
                            { label: '결석', color: 'bg-ios-rose' },
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
    );
  };



  // Step 1.5: Management Step (Overlay)
  const renderManagementStep = () => {
      if (!manageDate) return null;
      
      const dateStr = format(manageDate, 'yyyy-MM-dd');
      const bookingsForDate = dailyBookings[dateStr] || [];
      const canManage = isDateBookable(manageDate);

      // Sort bookings by start time
      bookingsForDate.sort((a, b) => (a.sessions?.start_time || '').localeCompare(b.sessions?.start_time || ''));

      const handleDelete = async () => {
          if (!confirm('정말로 이 예약을 취소하시겠습니까?')) return;
          
          setLoading(true);
          try {
              const bookingIds = bookingsForDate.map(b => b.id);
              
              const { error } = await supabase
                  .from('bookings')
                  .delete()
                  .in('id', bookingIds);

              if (error) throw error;
              
              alert('예약이 취소되었습니다.');
              setManageDate(null);
              // Refresh
              const { data: bookings } = await supabase
                .from('bookings')
                .select(`
                    *,
                    sessions (id, name, start_time, end_time),
                    seats (id, seat_number, zone_name, zone_id, zones(name)),
                    attendance (status)
                `)
                .or(`student_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`);
               
               // Re-process
                if (bookings) {
                    const activityMap = {};
                    const bookingMap = {};
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    bookings.forEach(b => {
                        const d = b.date;
                        if (!bookingMap[d]) bookingMap[d] = [];
                        bookingMap[d].push(b);
                        const att = b.attendance && b.attendance[0];
                        let status = 'reserved';
                        if (d < todayStr) {
                             if (att) status = (att.status === 'present' ? 'present' : att.status === 'late' ? 'late' : 'absent');
                             else status = 'absent';
                        } else if (d === todayStr) {
                             if (att) status = (att.status === 'present' ? 'present' : att.status === 'late' ? 'late' : 'reserved');
                        }
                        // Simple logic for refresh
                         if (!activityMap[d] || (status === 'present' && activityMap[d] !== 'present') || (status === 'late' && activityMap[d] === 'absent')) {
                            activityMap[d] = status;
                        }
                    });
                    setUserActivities(activityMap);
                    setDailyBookings(bookingMap);
                }

          } catch (err) {
              console.error("Delete failed:", err);
              alert('예약 취소 중 오류가 발생했습니다.');
          } finally {
              setLoading(false);
          }
      };

      const handleModify = async () => {
          if (!confirm('학습 세션만 수정이 가능하며, 좌석은 수정하실 수 없습니다.\n좌석 변경을 원하실 경우, 기존 예약을 취소하신 후 다시 예약해 주시기 바랍니다.')) return;
          
          setLoading(true);
          try {
                const bookingIds = bookingsForDate.map(b => b.id);
                const first = bookingsForDate[0];
                
                // Set existing data to state
                setSelectedDate(manageDate);
                // Extract session IDs
                setSelectedSessionIds(bookingsForDate.map(b => b.session_id));
                
                // Lock Zone and Seat
                if (first && first.seats) {
                    setSelectedZoneId(first.seats.zone_id);
                    setSelectedSection(first.seats.zone_name || '일반');
                    setSelectedSeatNumber(getCleanSeatNumber(first.seats));
                }
                
                // Get study content (from plan if available, or just first booking)
                setStudyContent(first.study_plans?.content || '');

                setEditingBookingIds(bookingIds);
                setManageDate(null);
                setCurrentStep(3); // Directly to Session selection
                
          } catch (err) {
              console.error("Modify failed:", err);
              alert('예약 수정 준비 중 오류가 발생했습니다.');
          } finally {
              setLoading(false);
          }
      };

      return (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
                  <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-[#1C1C1E]">
                                {format(manageDate, 'M월 d일')} 예약 상세
                            </h3>
                            <button onClick={() => setManageDate(null)} className="p-2 -mr-2 text-gray-400 hover:text-black">
                                <X className="w-5 h-5" />
                            </button>
                      </div>

                      <div className="space-y-4 mb-8 max-h-[50vh] overflow-y-auto scrollbar-hide">
                          {bookingsForDate.length > 0 ? bookingsForDate.map((b, i) => {
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
                                    </div>
                                </div>
                            );
                        }) : (
                            <p className="text-center text-gray-400 text-sm">예약 정보가 없습니다.</p>
                        )}
                      </div>

                      <div className="flex gap-3">
                          <button
                              onClick={handleDelete}
                              disabled={!canManage || loading}
                              className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 border-red-100 text-red-500 bg-red-50 hover:bg-red-100 transition-colors
                                  ${(!canManage || loading) ? 'opacity-50 cursor-not-allowed' : ''}
                              `}
                          >
                              예약 취소
                          </button>
                          <button
                              onClick={handleModify}
                              disabled={!canManage || loading}
                              className={`flex-1 py-3 rounded-xl font-bold text-sm bg-ios-indigo text-white hover:bg-ios-indigo/90 transition-colors shadow-lg shadow-ios-indigo/30
                                  ${(!canManage || loading) ? 'opacity-50 cursor-not-allowed shadow-none' : ''}
                              `}
                          >
                              수정하기
                          </button>
                      </div>
                      
                      {!canManage && (
                          <p className="text-[10px] text-center text-gray-400 font-medium mt-3">
                              * 학습 예약일 2일전 이후 또는 이미 지난 학습일은 수정/취소가 불가능합니다.
                          </p>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  // Step 2: Session
  const renderSessionStep = () => {
     const toggleSession = (id) => {
         if (selectedSessionIds.includes(id)) {
             setSelectedSessionIds(selectedSessionIds.filter(sid => sid !== id));
         } else {
             setSelectedSessionIds([...selectedSessionIds, id]);
         }
     };

     return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-black text-[#1C1C1E]">세션 선택</h3>
                   <p className="text-sm font-bold text-ios-gray">이용할 시간을 모두 선택해주세요.<br/>(복수 선택 가능)</p>
                </div>
                {editingBookingIds && (
                    <div className="text-right">
                        <span className="text-[10px] font-black text-ios-indigo bg-ios-indigo/10 px-2 py-1 rounded-full uppercase">수정 모드</span>
                    </div>
                )}
            </div>

            {editingBookingIds && (
                <div className="p-3 bg-ios-indigo/5 border border-ios-indigo/10 rounded-xl flex items-start gap-3">
                    <div className="mt-0.5">
                        <Info className="w-4 h-4 text-ios-indigo" />
                    </div>
                    <p className="text-[11px] font-bold text-ios-indigo leading-tight">
                        학습 세션만 수정이 가능하며, 좌석({selectedSection}-{selectedSeatNumber}번)은 고정됩니다. 좌석 변경을 원하실 경우 예약을 취소하신 후 다시 예약해 주시기 바랍니다.
                    </p>
                </div>
            )}

            <div className="space-y-3 mt-4">
                {operationalSessions.filter(session => {
                     // Filter based on selected Date and operatingRules
                     if (!selectedDate) return false;
                     const dayOfWeek = selectedDate.getDay();
                     return operatingRules.some(r => r.session_id === session.id && r.day_of_week === dayOfWeek);
                }).map(session => {
                    const isSelected = selectedSessionIds.includes(session.id);
                    return (
                        <button
                            key={session.id}
                            onClick={() => toggleSession(session.id)}
                            className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group text-left ios-tap
                                ${isSelected 
                                    ? 'border-ios-indigo bg-ios-indigo/5' 
                                    : 'border-white bg-white shadow-sm'
                                }
                            `}
                        >
                            <div>
                                <h4 className={`text-base font-black ${isSelected ? 'text-ios-indigo' : 'text-[#1C1C1E]'}`}>
                                    {session.name}
                                </h4>
                                <p className="text-xs font-bold text-ios-gray mt-1">
                                    {session.start_time.slice(0,5)} ~ {session.end_time.slice(0,5)}
                                </p>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                                ${isSelected ? 'border-ios-indigo bg-ios-indigo text-white' : 'border-gray-200 bg-gray-50'}
                            `}>
                                {isSelected && <CheckCircle2 className="w-4 h-4" />}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
     );
  };

  // Step 3: Zone
  const renderZoneStep = () => {
      return (
        <div className="space-y-4 animate-fade-in">
            <h3 className="text-xl font-black text-[#1C1C1E]">학습 공간 선택</h3>
            <p className="text-sm font-bold text-ios-gray">이용하실 학습실(Zone)을 선택해주세요.</p>
            <div className="space-y-3 mt-4">
                {zones.map(zone => {
                    const isSelected = selectedZoneId === zone.id;
                    return (
                         <button
                            key={zone.id}
                            onClick={() => setSelectedZoneId(zone.id)}
                            className={`w-full p-5 rounded-2xl border-2 transition-all flex items-center justify-between text-left ios-tap
                                ${isSelected 
                                    ? 'border-ios-indigo bg-ios-indigo/5' 
                                    : 'border-white bg-white shadow-sm'
                                }
                            `}
                        >
                            <span className={`text-lg font-black ${isSelected ? 'text-ios-indigo' : 'text-[#1C1C1E]'}`}>
                                {zone.name}
                            </span>
                            {isSelected && <div className="text-xs font-bold text-ios-indigo bg-ios-indigo/10 px-2 py-1 rounded">선택됨</div>}
                        </button>
                    )
                })}
            </div>
        </div>
      );
  };

  // Step 4: Seat
  const renderSeatStep = () => {
       // 1. Get Unique Sections from valid seats using `zone_name`
       const getSections = () => {
           if (!zoneSeats || zoneSeats.length === 0) return [];
           const sections = new Set();
           zoneSeats.forEach(s => {
               if (s.zone_name) sections.add(s.zone_name);
           });
           
           return Array.from(sections).sort();
       };

       const sections = getSections();

       const cycleSection = (direction) => {
           if (sections.length === 0) return;
           
           let currentIndex = sections.indexOf(selectedSection);
           if (currentIndex === -1) currentIndex = 0; 

           let nextIndex;
           if (direction === 'up') {
               nextIndex = (currentIndex - 1 + sections.length) % sections.length;
           } else {
               nextIndex = (currentIndex + 1) % sections.length;
           }
           
           const nextSection = sections[nextIndex];
           setSelectedSection(nextSection);
           
           // Reset seat number when section changes
           const first_seat = zoneSeats.find(s => (s.zone_name || '') === nextSection);
           
           if (first_seat) {
               setSelectedSeatNumber(getCleanSeatNumber(first_seat));
           } else {
               setSelectedSeatNumber('');
           }
       };

       const cycleSeat = (direction) => {
           if (!zoneSeats || zoneSeats.length === 0) return;
           
           const currentSec = selectedSection || sections[0]; 

           // Filter by zone_name
           const SectionSeats = zoneSeats.filter(s => {
               const sName = s.zone_name || '';
               return sName === currentSec;
           });
           
           if (SectionSeats.length === 0) return;

           // Sort seats numerically by treating seat_number as number if possible
           const sortedSeats = [...SectionSeats].sort((a, b) => {
               const numA = parseInt(a.seat_number.toString().replace(/\D/g, '')) || 0;
               const numB = parseInt(b.seat_number.toString().replace(/\D/g, '')) || 0;
               return numA - numB;
           });

           const currentSeat = sortedSeats.find(s => getCleanSeatNumber(s) === selectedSeatNumber.toString());
           
           let nextIndex = 0;
           if (currentSeat) {
               const currentIndex = sortedSeats.indexOf(currentSeat);
               if (direction === 'up') {
                   nextIndex = (currentIndex - 1 + sortedSeats.length) % sortedSeats.length;
               } else {
                   nextIndex = (currentIndex + 1) % sortedSeats.length;
               }
           } else {
               nextIndex = 0;
           }

           const nextSeat = sortedSeats[nextIndex];
           setSelectedSeatNumber(getCleanSeatNumber(nextSeat));
       };

       const currentSectionDisplay = selectedSection || (sections.length > 0 ? sections[0] : '-');
       
       // Helper for Name and Grade display
       const studentName = currentUser?.full_name || currentUser?.name || '학생';
       const studentId = currentUser?.student_id || currentUser?.username || '';
       const studentGrade = parseInt(studentId.substring(0, 1)) || '';

       return (
         <div className="space-y-4 animate-fade-in">
              <h3 className="text-xl font-black text-[#1C1C1E]">
                {zones.find(z => z.id === selectedZoneId)?.name} 좌석 선택
              </h3>
              <p className="text-sm font-bold text-ios-gray">
                  구역(Section)을 선택한 후 번호를 입력해주세요.
              </p>

              {/* Grade Guidance Message - Personalized and Fixed Grade Logic */}
              <div className="bg-ios-rose/5 p-4 rounded-2xl border border-ios-rose/10 flex items-start gap-3 mt-2 animate-fade-in">
                  <div className="mt-0.5">
                      <Info className="w-4 h-4 text-ios-rose" />
                  </div>
                  <p className="text-[11px] font-bold text-[#1C1C1E] leading-relaxed">
                      {studentName}님의 학년({studentGrade || '?'}학년)이 이용 가능한 구역을 선택해주세요.
                      <br/>
                      <span className="text-ios-rose font-bold whitespace-pre-wrap">
                          {(() => {
                              if (!restrictionSettings.enabled) return "현재 모든 구역을 자유롭게 이용할 수 있습니다.";
                              
                              const spaceRestr = restrictionSettings.restrictions[selectedZoneId] || {};
                              const allowedAreas = Object.keys(spaceRestr).filter(area => 
                                  {
                                      const grades = spaceRestr[area];
                                      return Array.isArray(grades) && grades.includes(studentGrade);
                                  }
                              );
                              const restrictedAreas = Object.keys(spaceRestr).filter(area => 
                                  {
                                      const grades = spaceRestr[area];
                                      return Array.isArray(grades) && !grades.includes(studentGrade);
                                  }
                              );

                              if (allowedAreas.length === 0 && restrictedAreas.length > 0) return "학습 공간 내 모든 구역이 이용 불가능합니다.";
                              if (restrictedAreas.length === 0) return "현재 학습 공간의 모든 구역을 이용할 수 있습니다.";
                              return `${allowedAreas.join(', ')} 구역을 이용하실 수 있습니다. (${restrictedAreas.join(', ')} 제외)`;
                          })()}
                      </span>
                  </p>
              </div>

             <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mt-4">
                 <div className="flex gap-4">
                     {/* Section Selector */}
                     <div className="flex-1 flex flex-col items-center gap-2">
                         <label className="text-xs font-black text-ios-gray uppercase tracking-widest">구역 (Section)</label>
                         <button 
                             onClick={() => cycleSection('up')}
                             className="p-2 text-gray-400 hover:text-ios-indigo transition-colors"
                         >
                             <ChevronUp className="w-6 h-6" />
                         </button>
                         <div className="h-16 flex items-center justify-center">
                             <span className="text-5xl font-black text-[#1C1C1E] text-center leading-tight">
                                 {currentSectionDisplay}
                             </span>
                         </div>
                         <button 
                             onClick={() => cycleSection('down')}
                             className="p-2 text-gray-400 hover:text-ios-indigo transition-colors"
                         >
                             <ChevronDown className="w-6 h-6" />
                         </button>
                     </div>

                     {/* Divider */}
                     <div className="w-px bg-gray-100 my-4"></div>

                     {/* Seat Number Selector */}
                     <div className="flex-1 flex flex-col items-center gap-2">
                         <label className="text-xs font-black text-ios-gray uppercase tracking-widest">번호 (No.)</label>
                         <button 
                             onClick={() => cycleSeat('up')}
                             className="p-2 text-gray-400 hover:text-ios-indigo transition-colors"
                         >
                             <ChevronUp className="w-6 h-6" />
                         </button>
                         <div className="h-16 flex items-center justify-center w-full">
                             <input 
                                 type="text" 
                                 value={selectedSeatNumber}
                                 onChange={(e) => setSelectedSeatNumber(e.target.value)}
                                 placeholder="-"
                                 className="w-full text-5xl font-black text-center border-none focus:ring-0 outline-none bg-transparent text-[#1C1C1E] p-0"
                             />
                         </div>
                         <button 
                             onClick={() => cycleSeat('down')}
                             className="p-2 text-gray-400 hover:text-ios-indigo transition-colors"
                         >
                             <ChevronDown className="w-6 h-6" />
                         </button>
                     </div>
                 </div>
                 
                 <div className="border-t border-gray-100 pt-6 mt-2">
                     <button 
                         onClick={() => setShowSeatMap(true)}
                         className="w-full py-4 rounded-xl bg-gray-50 hover:bg-gray-100 text-[#1C1C1E] font-bold text-sm flex items-center justify-center gap-2 transition-all border border-gray-200"
                     >
                         <MapPin className="w-4 h-4" />
                         좌석 배치도 보기
                     </button>
                 </div>
             </div>

              {/* Validation Hint */}
              {selectedSeatNumber && (
                  <div className="flex items-center gap-2 justify-center text-ios-indigo text-xs font-bold animate-fade-in">
                      <CheckCircle2 className="w-3 h-3" />
                      {zones.find(z => z.id === selectedZoneId)?.name} 
                      {' '}
                      {currentSectionDisplay !== '일반' ? `${currentSectionDisplay}구역` : ''} 
                      {' - '}
                      {selectedSeatNumber}번
                  </div>
              )}
         </div>
       );
  };

  // Step 5: Content
  const renderContentStep = () => {
      // Sort selected sessions by time (assuming ID order implies time or sort explicitly if needed)
      // Since operationalSessions is already sorted, we can filter from it
      const selectedSessions = operationalSessions.filter(s => selectedSessionIds.includes(s.id));

      return (
        <div className="space-y-6 animate-fade-in">
             <div>
                <h3 className="text-xl font-black text-[#1C1C1E]">학습 내용</h3>
                <p className="text-sm font-bold text-ios-gray">
                    각 교시(세션)별로 계획하신 학습 내용을 입력해주세요.
                </p>
             </div>
             
             <div className="space-y-4">
                {selectedSessions.map((session, index) => (
                    <div key={session.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 rounded-full bg-ios-indigo text-white flex items-center justify-center text-xs font-black">
                                {index + 1}
                            </div>
                            <h4 className="text-base font-black text-[#1C1C1E]">{session.name}</h4>
                            <span className="text-xs font-bold text-ios-gray ml-auto">
                                {session.start_time.slice(0,5)} ~ {session.end_time.slice(0,5)}
                            </span>
                        </div>
                        <textarea 
                            value={studyContent[session.id] || ''}
                            onChange={(e) => setStudyContent(prev => ({
                                ...prev,
                                [session.id]: e.target.value
                            }))}
                            placeholder={`${session.name} 시간에 학습할 내용을 입력하세요 (예: 수학 2단원)`}
                            className="w-full h-24 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-medium resize-none focus:ring-2 focus:ring-ios-indigo/20 outline-none transition-all"
                        />
                    </div>
                ))}
             </div>
        </div>
      );
  };

  // Step 6: Review
  const renderReviewStep = () => {
      const dateStr = selectedDate ? format(selectedDate, 'M월 d일 (EEE)', { locale: ko }) : '';
      const zoneName = zones.find(z => z.id === selectedZoneId)?.name;
      const selectedSessions = operationalSessions.filter(s => selectedSessionIds.includes(s.id));

      return (
        <div className="space-y-6 animate-fade-in">
             <h3 className="text-xl font-black text-[#1C1C1E] text-center">예약 정보 확인</h3>
             
             <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden">
                 <div className="p-6 space-y-6">
                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-full bg-ios-indigo/10 flex items-center justify-center shrink-0">
                             <Calendar className="w-5 h-5 text-ios-indigo" />
                         </div>
                         <div>
                             <p className="text-xs font-bold text-ios-gray">날짜</p>
                             <p className="text-lg font-black text-[#1C1C1E]">{dateStr}</p>
                         </div>
                     </div>

                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-full bg-ios-rose/10 flex items-center justify-center shrink-0">
                             <Clock className="w-5 h-5 text-ios-rose" />
                         </div>
                         <div>
                             <p className="text-xs font-bold text-ios-gray">세션</p>
                             <p className="text-lg font-black text-[#1C1C1E]">
                                {selectedSessions.map(s => s.name).join(', ')}
                             </p>
                         </div>
                     </div>

                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-full bg-ios-emerald/10 flex items-center justify-center shrink-0">
                             <MapPin className="w-5 h-5 text-ios-emerald" />
                         </div>
                         <div>
                             <p className="text-xs font-bold text-ios-gray">장소</p>
                             <p className="text-lg font-black text-[#1C1C1E]">{zoneName}</p>
                             <p className="text-base font-bold text-ios-indigo mt-0.5">{selectedSeatNumber}번 좌석</p>
                         </div>
                     </div>

                     <div className="flex items-start gap-4 border-t border-gray-50 pt-4">
                         <div className="w-10 h-10 rounded-full bg-ios-amber/10 flex items-center justify-center shrink-0">
                             <BookOpen className="w-5 h-5 text-ios-amber" />
                         </div>
                         <div className="flex-1">
                             <p className="text-xs font-bold text-ios-gray mb-2">학습 계획</p>
                             <div className="space-y-2">
                                {selectedSessions.map(s => (
                                    <div key={s.id} className="flex gap-2 text-sm">
                                        <span className="font-bold text-ios-gray min-w-[3rem]">{s.name}:</span>
                                        <span className="font-medium text-[#1C1C1E] line-clamp-1">
                                            {studyContent[s.id] || '입력 없음'}
                                        </span>
                                    </div>
                                ))}
                             </div>
                         </div>
                     </div>
                 </div>
             </div>

             <div className="text-center">
                <p className="text-xs text-red-400 font-bold mb-2">
                    * 제출 후에는 수정이 불가능할 수 있습니다.
                </p>
             </div>
        </div>
      );
  };

  // --- Navigation Handlers ---
  const canProceed = () => {
    switch(currentStep) {
        case 0: return !!selectedDate;
        case 1: return !!selectedZoneId; // Step 1: Zone
        case 2: return !!selectedSeatNumber; // Step 2: Seat
        case 3: return selectedSessionIds.length > 0; // Step 3: Session
        case 4: 
            // All selected sessions must have some content (optional: or at least one?)
            // Let's enforce content for all sessions for better data
            const selectedSessions = selectedSessionIds;
            return selectedSessions.every(sid => (studyContent[sid] || '').trim().length > 0);
        default: return true;
    }
  };

  const handleNext = () => {
      if (currentStep === 0 && editingBookingIds) {
          setCurrentStep(3); // Jump to Session step in edit mode
      } else if (currentStep === 2) {
          // Validate Grade Restriction for Sub-Zone
          if (restrictionSettings.enabled) {
              const spaceRestr = restrictionSettings.restrictions[selectedZoneId] || {};
              const permittedGrades = spaceRestr[selectedSection];
              const studentIdStr = currentUser?.student_id || currentUser?.username || '';
              const studentGrade = parseInt(studentIdStr.substring(0,1));

              if (permittedGrades && Array.isArray(permittedGrades) && permittedGrades.length > 0) {
                  if (!permittedGrades.includes(studentGrade)) {
                      alert(`'${selectedSection}' 구역은 ${permittedGrades.sort().join(', ')}학년 전용 공간입니다.`);
                      return;
                  }
              }
          }
          setCurrentStep(p => p + 1);
      } else if (currentStep < 5 && canProceed()) {
          setCurrentStep(p => p + 1);
      }
  };
  
  const handleBack = () => {
      if (currentStep === 3 && editingBookingIds) {
          setCurrentStep(0); // Back to Date Step instead of Seat/Zone in edit mode
      } else if (currentStep > 0) {
          setCurrentStep(p => p - 1);
      } else {
          onCancel();
      }
  };

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      const isStudent = currentUser.role === 'student';
      const uniqueSessionIds = [...new Set(selectedSessionIds)];

      // 1. Resolve Seat ID
      let targetSeatId = null;
      if (zoneSeats && zoneSeats.length > 0) {
        const matchedSeat = zoneSeats.find(s => 
          (s.zone_name || '일반') === selectedSection && 
          getCleanSeatNumber(s) === selectedSeatNumber.toString()
        );
        if (matchedSeat) targetSeatId = matchedSeat.id;
      }

      if (!targetSeatId) {
        alert('해당 좌석을 찾을 수 없습니다. 번호를 다시 확인해주세요.');
        setLoading(false);
        return;
      }

      // 2. Transact Bookings and Study Plans via Secure RPC (V2)
      // This solves RLS (SECURITY DEFINER) and Atomicity (all or nothing)
      const studentUserId = isStudent ? (currentUser.user_id || null) : null;
      
      const { error: rpcError } = await supabase.rpc('manage_booking_v2', {
        p_user_id: isStudent ? studentUserId : currentUser.id,
        p_student_id: isStudent ? currentUser.id : null,
        p_date: formattedDate,
        p_session_ids: uniqueSessionIds,
        p_seat_id: targetSeatId,
        p_study_contents: studyContent, // Passing JSONB object: { "sessionId": "content" }
        p_old_booking_ids: editingBookingIds || []
      });

      if (rpcError) {
        console.error("Booking Transaction Failed:", rpcError);
        // User-friendly mapping for common DB errors
        if (rpcError.code === '23505') throw new Error('중복된 예약 기록이 있습니다.');
        throw rpcError;
      }
      
      alert(editingBookingIds ? '수정이 완료되었습니다!' : '예약이 성공적으로 완료되었습니다!');
      onSuccess();

    } catch (err) {
      console.error("Final Submit Error:", err);
      const errorMsg = err.message || '알 수 없는 오류가 발생했습니다.';
      alert('처리에 실패했습니다.\n\n상세: ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
        {/* Header */}
        <div className="flex-none px-6 py-4 flex items-center justify-between bg-white/80 backdrop-blur border-b border-gray-200">
            <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-ios-gray hover:text-[#1C1C1E] transition-colors">
                <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-base font-black text-[#1C1C1E]">
                예약하기 ({currentStep + 1}/6)
            </span>
            <div className="w-10" /> {/* Spacer */}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-32">
            <div className="max-w-md mx-auto">
                {currentStep === 0 && renderDateStep()}
                {currentStep === 1 && renderZoneStep()}
                {currentStep === 2 && renderSeatStep()}
                {currentStep === 3 && renderSessionStep()}
                {currentStep === 4 && renderContentStep()}
                {currentStep === 5 && renderReviewStep()}
            </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex-none p-6 bg-white border-t border-gray-100 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
             <button
                onClick={currentStep === 5 ? handleSubmit : handleNext}
                disabled={!canProceed() || loading}
                className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all shadow-lg ios-tap
                    ${canProceed() && !loading
                        ? 'bg-[#1C1C1E] text-white hover:bg-gray-800'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                    }
                `}
            >
                {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : currentStep === 5 ? (
                    <><CheckCircle2 className="w-5 h-5" /> 예약 확정하기</>
                ) : (
                    <>다음 단계 <ChevronRight className="w-5 h-5" /></>
                )}
            </button>
        </div>

        {/* Modal */}
            <SeatMapModal 
                isOpen={showSeatMap}
                zoneId={selectedZoneId} 
                selectedDate={selectedDate}
                onClose={() => setShowSeatMap(false)} 
                onSelect={(seatData) => {
                    if (seatData) {
                        // Sync Section
                        const sec = seatData.zone_name || '일반';
                        setSelectedSection(sec);
                        
                        // Sync Clean Number
                        const cleanNum = getCleanSeatNumber(seatData);
                        setSelectedSeatNumber(cleanNum);
                        
                        setShowSeatMap(false);
                    }
                }}
            />

            
            {/* Management Details Modal */}
            {renderManagementStep()}
    </div>
  );
};

export default StudentBookingMobileWizard;

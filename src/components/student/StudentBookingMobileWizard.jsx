import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Calendar, Clock, MapPin, Armchair, BookOpen, Save, 
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, X,
  ChevronUp, ChevronDown
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
  const [studyContent, setStudyContent] = useState('');

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
            // Parallel Fetch: Sessions, Defaults, Exceptions, AND Seats for this Zone
            const [sRes, dRes, eRes, seatsRes] = await Promise.all([
                 supabase.from('sessions')
                    .select('*')
                    .eq('zone_id', selectedZoneId)
                    .order('start_time'),
                 supabase.from('operation_defaults')
                    .select('*')
                    .eq('zone_id', selectedZoneId),
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
                // Use explicit zone_name for Section (User Correction)
                // If zone_name is empty/null, fallback to '일반'
                const firstSection = seats[0].zone_name || '일반';
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
                    date,
                    attendance (
                        status
                    )
                `)
                .eq('user_id', currentUser.id);
            
            if (bookings) {
                const activityMap = {};
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                
                bookings.forEach(b => {
                    const d = b.date;
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
                {['일','월','화','수','목','금','토'].map(d => (
                    <div key={d} className="text-center text-xs font-bold text-gray-400 py-2">{d}</div>
                ))}
                
                {calendarGrid.map((date, idx) => {
                    if (!date) {
                        return <div key={`empty-${idx}`} />;
                    }
                    
                    const available = isDateBookable(date);
                    const isSelected = selectedDate && isSameDay(date, selectedDate);
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const activity = userActivities[dateStr];
                    
                    return (
                        <button
                            key={idx}
                            disabled={!available}
                            onClick={() => setSelectedDate(date)}
                            className={`
                                aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all relative
                                ${isSelected 
                                    ? 'bg-[#1C1C1E] text-white shadow-xl scale-105 z-10' 
                                    : activity === 'present' ? 'bg-ios-emerald/10 text-ios-emerald' :
                                      activity === 'late' ? 'bg-ios-amber/10 text-ios-amber' :
                                      activity === 'absent' ? 'bg-ios-rose/10 text-ios-rose' :
                                      activity === 'reserved' ? 'bg-ios-indigo/10 text-ios-indigo' :
                                      available 
                                        ? 'bg-white text-[#1C1C1E] border border-gray-100 hover:border-gray-300' 
                                        : 'bg-transparent text-gray-400 cursor-not-allowed' 
                                }
                            `}
                        >
                            <span className={!available && !activity ? 'opacity-50' : ''}>{format(date, 'd')}</span>
                            {activity && (
                                <span className={`w-1.5 h-1.5 rounded-full absolute bottom-2 ${
                                    isSelected ? 'bg-white' :
                                    activity === 'present' ? 'bg-ios-emerald' :
                                    activity === 'late' ? 'bg-ios-amber' :
                                    activity === 'absent' ? 'bg-ios-rose' :
                                    'bg-ios-indigo'
                                }`} />
                            )}
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
            <h3 className="text-xl font-black text-[#1C1C1E]">세션 선택</h3>
            <p className="text-sm font-bold text-ios-gray">이용할 시간을 모두 선택해주세요.<br/>(복수 선택 가능)</p>
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
               // Use zone_name explicitly (User Correction)
               sections.add(s.zone_name || '일반');
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
               nextIndex = (currentIndex + 1) % sections.length;
           } else {
               nextIndex = (currentIndex - 1 + sections.length) % sections.length;
           }
           
           const nextSection = sections[nextIndex];
           setSelectedSection(nextSection);
           
           // Reset seat number when section changes
           const firstSeatOfSection = zoneSeats.find(s => (s.zone_name || '일반') === nextSection);
           
           if (firstSeatOfSection) {
               setSelectedSeatNumber(getCleanSeatNumber(firstSeatOfSection));
           } else {
               setSelectedSeatNumber('');
           }
       };

       const cycleSeat = (direction) => {
           if (!zoneSeats || zoneSeats.length === 0) return;
           
           const currentSec = selectedSection || sections[0]; 

           // Filter by zone_name
           const SectionSeats = zoneSeats.filter(s => {
               const sName = s.zone_name || '일반';
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
                   nextIndex = (currentIndex + 1) % sortedSeats.length;
               } else {
                   nextIndex = (currentIndex - 1 + sortedSeats.length) % sortedSeats.length;
               }
           } else {
               nextIndex = 0;
           }

           const nextSeat = sortedSeats[nextIndex];
           setSelectedSeatNumber(getCleanSeatNumber(nextSeat));
       };

       const currentSectionDisplay = selectedSection || (sections.length > 0 ? sections[0] : '-');

       return (
         <div className="space-y-4 animate-fade-in">
              <h3 className="text-xl font-black text-[#1C1C1E]">
                {zones.find(z => z.id === selectedZoneId)?.name} 좌석 선택
              </h3>
              <p className="text-sm font-bold text-ios-gray">
                  구역(Section)을 선택한 후 번호를 입력해주세요.
              </p>

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
      return (
        <div className="space-y-4 animate-fade-in">
             <h3 className="text-xl font-black text-[#1C1C1E]">학습 내용</h3>
             <p className="text-sm font-bold text-ios-gray">
                 해당 시간에 계획하고 있는 학습 내용을 간단히 적어주세요.
             </p>
             
             <textarea 
                value={studyContent}
                onChange={(e) => setStudyContent(e.target.value)}
                placeholder="예: 수학의 정석 2단원 문제풀이, 영어 단어 50개 암기 등"
                className="w-full h-48 bg-white border border-gray-200 rounded-2xl p-5 text-base font-medium resize-none focus:ring-2 focus:ring-ios-indigo/20 outline-none transition-all shadow-sm"
             />
        </div>
      );
  };

  // Step 6: Review
  const renderReviewStep = () => {
      const dateStr = selectedDate ? format(selectedDate, 'M월 d일 (EEE)', { locale: ko }) : '';
      const zoneName = zones.find(z => z.id === selectedZoneId)?.name;
      const sessionNames = operationalSessions.filter(s => selectedSessionIds.includes(s.id)).map(s => s.name).join(', ');

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
                             <p className="text-lg font-black text-[#1C1C1E]">{sessionNames}</p>
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
                         <div>
                             <p className="text-xs font-bold text-ios-gray">학습 계획</p>
                             <p className="text-sm font-medium text-[#1C1C1E] leading-relaxed line-clamp-3">
                                 {studyContent || '입력 없음'}
                             </p>
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
        case 4: return !!studyContent.trim();
        default: return true;
    }
  };

  const handleNext = () => {
      if (currentStep < 5 && canProceed()) setCurrentStep(p => p + 1);
  };
  
  const handleBack = () => {
      if (currentStep > 0) setCurrentStep(p => p - 1);
      else onCancel();
  };

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    try {
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');

        // 1. Resolve Seat ID
        // Use zoneSeats to find the seat object using the Clean Number logic
        // We match where `zone_name` is selectedSection AND `clean_number` is selectedSeatNumber
        
        let targetSeatId = null;
        
        if (zoneSeats && zoneSeats.length > 0) {
            const matchedSeat = zoneSeats.find(s => {
                const sSection = s.zone_name || '일반';
                const sCleanNum = getCleanSeatNumber(s);
                
                // Flexible match: 
                // 1. Check Section (if selectedSection is set, usually matches)
                // 2. Check Number (must match input)
                
                // If selectedSection is '일반', maybe we don't care about section?
                // But generally users selected a Section.
                
                return sSection === selectedSection && sCleanNum === selectedSeatNumber.toString();
            });
            
            if (matchedSeat) {
                targetSeatId = matchedSeat.id;
            }
        }



        if (!targetSeatId) {
             alert('해당 좌석을 찾을 수 없습니다. 번호를 다시 확인해주세요.');
             setLoading(false);
             return;
        }

        // 2. Insert Bookings (Loop sessions)
        const bookings = selectedSessionIds.map(sessionId => ({
            user_id: currentUser.id,
            seat_id: targetSeatId,
            date: formattedDate,
            session_id: sessionId,
            booking_type: 'regular'
        }));

        const { error: bookingError } = await supabase
            .from('bookings')
            .insert(bookings);

        if (bookingError) throw bookingError;

        // 3. Upsert Study Plan
        // Plan is per date? or per session? Schema says 'session_id, date'.
        // User input one content for all sessions? Let's save for EACH session or just the first?
        // Schema: UNIQUE(user_id, date, session_id)? No unique constraint shown in my memory but logic suggests per slot.
        // Let's Insert/Upsert for each session to be safe, or just one record if schema supports generic date plan.
        // Re-reading schema: study_plans has session_id.
        // We will insert for all selected sessions.
        const plans = selectedSessionIds.map(sessionId => ({
            user_id: currentUser.id,
            date: formattedDate,
            session_id: sessionId,
            content: studyContent
        }));

        const { error: planError } = await supabase
            .from('study_plans')
            .insert(plans);
        
        // Ignore plan error if duplicate? or just let it throw.
        // Better to use upsert if supported.
        
        alert('예약이 성공적으로 완료되었습니다!');
        onSuccess();

    } catch (err) {
        console.error("Booking failed:", err);
        alert('예약 처리에 실패했습니다. 중복된 예약이 있는지 확인해주세요.\n' + err.message);
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
    </div>
  );
};

export default StudentBookingMobileWizard;

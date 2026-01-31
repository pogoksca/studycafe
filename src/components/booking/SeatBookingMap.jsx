import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { supabase } from '../../lib/supabase';
import { Search, Info, Map as MapIcon, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays, parseISO, isToday, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';

const SeatBookingMap = ({ onSelectSeat, selectedProxyUser, viewDate, onDateChange, selectedZoneId, onZoneChange, minimal = false }) => {
  const containerRef = useRef(null);
  const fabricRef = useRef(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [opData, setOpData] = useState({ quarters: [], exceptions: [], operatingRules: [] });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setCurrentUser(profile);
    }
    
    const { data: zoneData } = await supabase.from('zones').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (zoneData && zoneData.length > 0) {
      setZones(zoneData);
      if (!selectedZoneId) onZoneChange(zoneData[0].id);
    }
  };

  useEffect(() => {
    if (!selectedZoneId) return;
    let isMounted = true;

    const init = async () => {
      // 1. Fetch operating data
      const [qData, eData, sData] = await Promise.all([
        supabase.from('operation_quarters').select('*'),
        supabase.from('operation_exceptions').select('*').eq('zone_id', selectedZoneId),
        supabase.from('sessions').select('*').eq('zone_id', selectedZoneId).order('start_time', { ascending: true })
      ]);

      if (isMounted) {
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
      }

      // 2. Load sessions for zone
      const sess = sData.data || [];
      if (!isMounted) return;
      setSessions(sess);

      // 3. Setup Canvas (DOM Isolation Pattern)
      if (!containerRef.current) return;

      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
      
      containerRef.current.innerHTML = '';
      const canvasEl = document.createElement('canvas');
      containerRef.current.appendChild(canvasEl);

      const canvas = new fabric.Canvas(canvasEl, {
        backgroundColor: 'transparent',
        selection: false,
        hoverCursor: 'pointer',
        moveCursor: 'grab'
      });
      fabricRef.current = canvas;

      await loadData(canvas, sess, currentUser);
      if (!isMounted) return;

      canvas.on('mouse:down', (options) => {
        if (!options.target) {
          canvas.isDragging = true;
          canvas.selection = false;
          canvas.lastPosX = options.e.clientX || options.e.touches?.[0]?.clientX;
          canvas.lastPosY = options.e.clientY || options.e.touches?.[0]?.clientY;
        } else if (options.target.data) {
          const seatData = options.target.data;
          setSelectedSeat(seatData);
          if (onSelectSeat) onSelectSeat(seatData);
          
          // Toggle selection outlines
          canvas.getObjects().forEach(obj => {
            if (obj.type === 'group') {
              const border = obj.getObjects().find(o => o.name === 'selectionBorder');
              if (border) border.set({ strokeWidth: 0 });
              obj.set('dirty', true);
            }
          });
          
          const targetBorder = options.target.getObjects().find(o => o.name === 'selectionBorder');
          if (targetBorder) {
            targetBorder.set({ strokeWidth: 2 });
          }
          options.target.set({ dirty: true, objectCaching: false });
          
          canvas.renderAll();
        } else {
          setSelectedSeat(null);
          if (onSelectSeat) onSelectSeat(null);
        }
      });

      canvas.on('mouse:move', (options) => {
        if (canvas.isDragging) {
          const e = options.e;
          const clientX = e.clientX || e.touches?.[0]?.clientX;
          const clientY = e.clientY || e.touches?.[0]?.clientY;
          
          const vpt = canvas.viewportTransform;
          vpt[4] += clientX - canvas.lastPosX;
          vpt[5] += clientY - canvas.lastPosY;
          canvas.requestRenderAll();
          canvas.lastPosX = clientX;
          canvas.lastPosY = clientY;
        }
      });

      canvas.on('mouse:wheel', (opt) => {
        const delta = opt.e.deltaY;
        const vpt = canvas.viewportTransform;
        vpt[5] -= delta;
        
        const canvasHeight = canvas.getHeight();
        const vptHeight = containerRef.current?.clientHeight || 0;
        if (vpt[5] > 0) vpt[5] = 0;
        if (vptHeight > 0 && vpt[5] < -(canvasHeight - vptHeight)) vpt[5] = -(canvasHeight - vptHeight);

        canvas.requestRenderAll();
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      canvas.on('mouse:up', () => {
        canvas.setViewportTransform(canvas.viewportTransform);
        canvas.isDragging = false;
        canvas.selection = false;
      });
    };

    init();
    return () => {
      isMounted = false;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [selectedZoneId, currentUser, viewDate]); 

  const isDateOperating = (dStr) => {
    const targetDate = parseISO(dStr);
    
    // 1. Check Quarters
    const isInQuarter = opData.quarters.some(q =>
        q.start_date && q.end_date &&
        isWithinInterval(targetDate, {
            start: parseISO(q.start_date),
            end: parseISO(q.end_date)
        })
    );
    if (!isInQuarter) return false;

    // 2. Check Exceptions (Holidays)
    const exception = opData.exceptions.find(e => e.exception_date === dStr);
    if (exception) return false;

    // 3. Check Operating Rules (At least one period active)
    const dayOfWeek = targetDate.getDay();
    const hasAnyPeriod = opData.operatingRules.some(r => r.day_of_week === dayOfWeek);
    
    if (!hasAnyPeriod) return false;

    return true;
  };

  const handleNextOperatingDay = () => {
    let checkDate = addDays(parseISO(viewDate), 1);
    let found = false;
    let iterations = 0;
    const maxSearch = 180; 

    while (!found && iterations < maxSearch) {
      const dStr = format(checkDate, 'yyyy-MM-dd');
      if (isDateOperating(dStr)) {
        onDateChange(dStr);
        found = true;
      } else {
        checkDate = addDays(checkDate, 1);
        iterations++;
      }
    }
  };

  const handlePrevOperatingDay = () => {
    let checkDate = subDays(parseISO(viewDate), 1);
    let found = false;
    let iterations = 0;
    const maxSearch = 180;

    while (!found && iterations < maxSearch) {
      const dStr = format(checkDate, 'yyyy-MM-dd');
      if (isDateOperating(dStr)) {
        onDateChange(dStr);
        found = true;
      } else {
        checkDate = subDays(checkDate, 1);
        iterations++;
      }
    }
  };

  const loadData = async (canvas, sessList, user) => {
    setLoading(true);
    
    // Fetch seats ONLY for selected zone
    const { data: seats } = await supabase
      .from('seats')
      .select('*')
      .eq('zone_id', selectedZoneId)
      .order('global_number', { ascending: true });
    
    // Fetch bookings for the selected date
    const { data: todayBookings } = await supabase
      .from('bookings')
      .select('*, profiles(username, full_name), sessions!inner(*)')
      .eq('date', viewDate)
      .eq('sessions.zone_id', selectedZoneId);

    if (seats && seats.length > 0) {
      if (!canvas || canvas.isDisposed || !canvas.getContext()) return; 
      
      canvas.clear();
      
      const minX = Math.min(...seats.map(s => s.pos_x));
      const maxX = Math.max(...seats.map(s => s.pos_x + (s.width || 72)));
      const layoutWidth = maxX - minX;
      
      // Expand canvas to container width
      const parentWidth = containerRef.current?.clientWidth || layoutWidth;
      const totalCanvasWidth = Math.max(layoutWidth, parentWidth);
      const offsetX = Math.round((totalCanvasWidth - layoutWidth) / 2 - minX);

      const minY = Math.min(...seats.map(s => s.pos_y));
      const maxY = Math.max(...seats.map(s => s.pos_y + (s.height || 72)));
      const layoutHeight = maxY - minY;
      const offsetY = Math.round(-minY); 
      
      const containerHeight = containerRef.current?.clientHeight || 0;
      const totalCanvasHeight = Math.max(layoutHeight, containerHeight); 

      if (canvas.isDisposed || !canvas.getContext()) return;
      canvas.setDimensions({ width: totalCanvasWidth, height: totalCanvasHeight });

      const now = new Date();
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
      
      const activeSession = sessList?.find(s => currentTime >= s.start_time && currentTime <= s.end_time);

      seats.forEach(s => {
        const seatBookings = todayBookings?.filter(b => b.seat_id === s.id) || [];
        renderSeat(canvas, { 
          ...s, 
          pos_x: s.pos_x + offsetX,
          pos_y: s.pos_y + offsetY
        }, seatBookings, activeSession, sessList);
      });
    }
    setLoading(false);
  };

  const renderSeat = (canvas, seatData, seatBookings, activeSession, sessList) => {
    // 0. Handle Structural Elements (Walls, Doors, etc.)
    if (seatData.type === 'structure') {
      const rect = new fabric.Rect({
        fill: seatData.bg_color || '#E5E5EA',
        width: seatData.width || 72,
        height: seatData.height || 72,
        rx: 12, ry: 12,
        stroke: seatData.stroke_color || '#D1D1D6',
        strokeWidth: 1,
      });

      const text = new fabric.IText(seatData.label || '', {
        fontSize: seatData.font_size || 10,
        originX: 'center', originY: 'center',
        left: (seatData.width || 72) / 2, top: (seatData.height || 72) / 2,
        fill: seatData.text_color || '#AEAEB2',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
        selectable: false,
      });

      const group = new fabric.Group([rect, text], {
        left: seatData.pos_x,
        top: seatData.pos_y,
        originX: 'left',
        originY: 'top',
        angle: seatData.rotation,
        selectable: false,
        evented: false, 
        data: { ...seatData }
      });
      
      canvas.add(group);
      return;
    }

    const currentBooking = seatBookings.find(b => b.session_id === activeSession?.id);
    const isActiveNow = !!currentBooking;
    const hasAnyBooking = seatBookings.length > 0;
    
    const canSeeDetails = (booking) => {
      if (!currentUser) return false;
      if (['admin', 'teacher'].includes(currentUser.role)) return true;
      if (booking.user_id === currentUser.id) return true;
      return false;
    };

    // 1. Background Square
    const baseColor = seatData.zone_color || '#5E5CE6';
    const bg = new fabric.Rect({
      fill: baseColor,
      opacity: isActiveNow ? 0.8 : (hasAnyBooking ? 0.12 : 0.03), 
      width: 72, 
      height: 72,
      rx: 12, ry: 12,
      strokeWidth: 0,
      left: 0, top: 0,
      originX: 'left', originY: 'top',
      selectable: false,
    });

    // 2. Seat Number Header Area 
    const headerBgResource = `M 0 12 Q 0 0 12 0 L 60 0 Q 72 0 72 12 L 72 18 L 0 18 z`;
    const headerBg = new fabric.Path(headerBgResource, {
      fill: baseColor,
      opacity: isActiveNow ? 1 : (hasAnyBooking ? 0.45 : 0.18),
      strokeWidth: 0,
      left: 0, top: 0,
      originX: 'left', originY: 'top',
      selectable: false,
    });

    const numText = new fabric.IText(seatData.display_number || seatData.seat_number, {
      fontSize: 11,
      left: 6, top: 4, 
      originX: 'left', originY: 'top',
      fill: isActiveNow ? '#ffffff' : baseColor,
      fontFamily: 'Inter, -apple-system', fontWeight: '900',
      selectable: false,
    });

    // 3. User Info (Detailed Text Lines)
    const prefixMap = {
      'Morning': '아침',
      'Dinner': '석식',
      '1st Period': '1 차',
      '2nd Period': '2 차',
      'period1': '1 차',
      'period2': '2 차'
    };
    
    const getCompactName = (name) => {
        if (prefixMap[name]) return prefixMap[name];
        // If it's a number/period like '3차시', take '3 차'
        const match = name.match(/(\d+)/);
        if (match) return `${match[1]} 차`;
        return name.substring(0,2);
    };
    
    const sortedSessions = [...(sessList || [])].sort((a,b) => a.id - b.id);
    
    const isDenseMode = sortedSessions.length > 4;
    let statusObjects = [];

    if (isDenseMode) {
      const midPoint = Math.ceil(sortedSessions.length / 2);
      const leftSessions = sortedSessions.slice(0, midPoint);
      const rightSessions = sortedSessions.slice(midPoint);

      const generateColText = (sessions) => sessions.map(sess => {
          const booking = seatBookings.find(b => b.session_id === sess.id);
          const prefix = getCompactName(sess.name);
          
          if (!booking) return `${prefix}:`;
          if (canSeeDetails(booking)) {
             return `${prefix}:${booking.profiles.full_name.substring(0,4)}`; 
           } else {
              return `${prefix}:(예약완료)`;
           }
      }).join('\n');

      const leftText = new fabric.Text(generateColText(leftSessions), {
        fontSize: 5.5,
        fontFamily: 'NanumSquareRound, Inter, sans-serif',
        fontWeight: 'normal',
        fill: isActiveNow ? '#ffffff' : '#000000',
        left: 4, top: 20,
        lineHeight: 1.35,
        selectable: false,
      });

      const rightText = new fabric.Text(generateColText(rightSessions), {
        fontSize: 5.5,
        fontFamily: 'NanumSquareRound, Inter, sans-serif',
        fontWeight: 'normal',
        fill: isActiveNow ? '#ffffff' : '#000000',
        left: 38, top: 20,
        lineHeight: 1.35,
        selectable: false,
      });

      statusObjects = [leftText, rightText];
    } else {
      sortedSessions.forEach((sess, idx) => {
         const booking = seatBookings.find(b => b.session_id === sess.id);
         const prefix = getCompactName(sess.name);
         
         const yPos = 21 + (idx * 13);
         
         const labelText = new fabric.Text(prefix, {
            fontSize: 8, 
            fontFamily: 'NanumSquareRound, Inter, sans-serif',
            fontWeight: 'normal',
            fill: isActiveNow ? '#ffffff' : '#000000',
            left: 4,
            top: yPos + 0.5,
            originX: 'left', originY: 'top',
            selectable: false,
         });
         statusObjects.push(labelText);

         const vDivider = new fabric.Line([17, yPos, 17, yPos + 10], {
            stroke: isActiveNow ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
            strokeWidth: 0.5,
            originX: 'left', originY: 'top',
            selectable: false,
         });
         statusObjects.push(vDivider);

         let info = '';
         if (booking) {
            if (canSeeDetails(booking)) {
               const studentId = booking.profiles.username || '';
               const name = booking.profiles.full_name || '';
               info = studentId ? `${studentId} ${name}` : name;
            } else {
               info = `(예약완료)`;
            }
         }

         const infoText = new fabric.Text(info, {
            fontSize: 8, 
            fontFamily: 'NanumSquareRound, Inter, sans-serif',
            fontWeight: 'normal',
            fill: isActiveNow ? '#ffffff' : '#000000',
            left: 23, 
            top: yPos,
            originX: 'left', originY: 'top',
            selectable: false,
         });
         statusObjects.push(infoText);

         if (idx < sortedSessions.length - 1) {
            const divider = new fabric.Line([4, yPos + 11.5, 68, yPos + 11.5], {
               stroke: isActiveNow ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
               strokeWidth: 0.5,
               originX: 'left', originY: 'top',
               selectable: false,
            });
            statusObjects.push(divider);
         }
      });
    }

      const selectionBorder = new fabric.Rect({
        width: 76, height: 76,
        rx: 14, ry: 14,
       fill: 'transparent',
        stroke: baseColor,
        strokeWidth: 0,
        left: -2, top: -2,
       originX: 'left', originY: 'top',
       selectable: false,
       name: 'selectionBorder',
       strokeUniform: true
     });

    const group = new fabric.Group([bg, headerBg, numText, ...statusObjects, selectionBorder], {
      left: seatData.pos_x,
      top: seatData.pos_y,
      originX: 'left', originY: 'top',
      angle: seatData.rotation,
      data: { ...seatData, seatBookings, activeSession },
      selectable: false,
      hoverCursor: 'pointer'
    });

    canvas.add(group);
  };

  return (
    <div className="flex flex-col gap-4 w-full h-full relative overflow-hidden">
      {/* Zone Selection Header - Hidden in Minimal Mode */}
      {!minimal && (
      <div className="flex items-center gap-4 px-1">
      <div className="flex gap-[10px] m-[10px] mb-0 border-none shrink-0 p-1 bg-gray-200/20 rounded-apple-md backdrop-blur-xl border border-white/40">
          {zones.map(z => (
            <button
              key={z.id}
              onClick={() => onZoneChange(z.id)}
              className={`px-6 py-2 rounded-apple-md text-xs font-black transition-all ios-tap border-none ${
                selectedZoneId === z.id ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-ios-gray hover:text-[#1C1C1E] hover:bg-white/40'
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-ios-gray">
          <Info className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">원하는 구역을 선택하고 좌석을 클릭해 주세요.</span>
        </div>
        
        <div className="flex bg-gray-200/20 p-1 rounded-apple-md border border-white/40 backdrop-blur-xl items-center gap-1 ml-auto">
          <button 
            onClick={handlePrevOperatingDay}
            className="p-1.5 hover:bg-white rounded-apple-md transition-all text-ios-gray hover:text-[#1C1C1E] ios-tap"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="relative group px-3 flex items-center gap-2 cursor-pointer">
            <Calendar className="w-3.5 h-3.5 text-ios-indigo" />
            <span className="text-[13px] font-black text-[#1C1C1E] whitespace-nowrap">
              {format(parseISO(viewDate), 'MM.dd (EEE)', { locale: ko })}
            </span>
            <input 
              type="date" 
              value={viewDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          <button 
            onClick={handleNextOperatingDay}
            className="p-1.5 hover:bg-white rounded-apple-md transition-all text-ios-gray hover:text-[#1C1C1E] ios-tap"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-30 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-ios-indigo border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      {/* 
          Canvas Host: Isolated from React reconciliation.
          Fabric.js will wrap the manually injected canvas here.
      */}
      <div 
        ref={containerRef} 
        className="flex-1 h-full relative overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none scrollbar-hide"
      />

    </div>
  );
};

export default SeatBookingMap;

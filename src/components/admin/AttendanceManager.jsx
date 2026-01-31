import React, { useEffect, useState, useRef } from 'react';
import { fabric } from 'fabric';
import { supabase } from '../../lib/supabase';
import { Check, X, Clock, UserCheck, Download, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

const AttendanceManager = ({ 
  isMobileView = false,
  externalZoneId = null,
  externalDate = null,
  externalSessionId = null
}) => {
  const containerRef = useRef(null);
  const fabricRef = useRef(null);
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  
  // NEW: Date Selection State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [activeSession, setActiveSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ present: 0, absent: 0, total: 0 });
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);


  useEffect(() => {
    fetchInitialData();
  }, []);

  // Sync props to internal state if they change (optional, but ensures consistency)
  useEffect(() => {
    if (externalZoneId) setSelectedZoneId(externalZoneId);
  }, [externalZoneId]);

  useEffect(() => {
    if (externalDate) setSelectedDate(externalDate);
  }, [externalDate]);

  useEffect(() => {
    if (externalSessionId) setActiveSession(externalSessionId);
  }, [externalSessionId]);

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: zoneData } = await supabase.from('zones').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (zoneData && zoneData.length > 0) {
      setZones(zoneData);
      setSelectedZoneId(zoneData[0].id);
    }
  };

  useEffect(() => {
    if (selectedZoneId) {
      fetchSessions(selectedZoneId);
    }
  }, [selectedZoneId]);

  const fetchSessions = async (zoneId) => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('zone_id', zoneId)
      .order('start_time', { ascending: true });
    
    if (data) {
      setSessions(data);
      // Auto-select session logic:
      // If Today -> Select active session based on time.
      // If History -> Default to first or keep null? Let's default to first for consistent view.
      
      const today = new Date().toISOString().split('T')[0];
      if (selectedDate === today) {
          const now = new Date();
          const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
          const currentSess = data.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
          if (currentSess) setActiveSession(currentSess.id);
          else if (data.length > 0) setActiveSession(data[0].id);
      } else {
          // For history, just default to first session if none selected, or keep selection if valid?
          // Simpler to just reset to first to ensure valid view.
          if (data.length > 0) setActiveSession(data[0].id);
      }
    }
  };
  
  // Re-fetch when Date changes too
  useEffect(() => {
      // If we change date, we might want to re-eval active session logic or just reload data.
      // fetchSessions handles auto-selection logic based on date. 
      // But fetchSessions is dep on zone. 
      // If only date changes, we should just reload data and maybe re-check session if today.
      
      const today = new Date().toISOString().split('T')[0];
      if (selectedDate === today && sessions.length > 0) {
          const now = new Date();
          const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
          const currentSess = sessions.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
          if (currentSess) setActiveSession(currentSess.id);
      }
      // If date changed to history, we stay on current activeSession ID (if valid) or maybe user wants to see same session on different day.
      // So no forced change of session unless invalid.
  }, [selectedDate]);

  useEffect(() => {
    if (!containerRef.current || !selectedZoneId || !activeSession) return;
    let isMounted = true;
    
    if (fabricRef.current) {
      fabricRef.current.dispose();
    }

    containerRef.current.innerHTML = '';
    const canvasEl = document.createElement('canvas');
    containerRef.current.appendChild(canvasEl);

    const canvas = new fabric.Canvas(canvasEl, {
      backgroundColor: 'transparent',
      selection: false,
      allowTouchScrolling: true,
    });
    fabricRef.current = canvas;

    const init = async () => {
      await loadAttendanceData(sessions);
    };

    init();

    let isPanning = false;
    let startX, startY, startScrollLeft, startScrollTop;

    canvas.on('mouse:down', (options) => {
      const evt = options.e;
      const target = options.target;
      
      // If we clicked on a seat's action button, don't start panning
      const hitButton = options.subTargets?.find(o => o.name === 'actionButton' || o.name === 'actionLabel');
      if (hitButton) {
          toggleAttendance(target);
          return;
      }

      isPanning = true;
      const pos = evt.type === 'touchstart' ? evt.touches[0] : evt;
      startX = pos.clientX;
      startY = pos.clientY;
      
      const scrollParent = containerRef.current?.closest('.mobile-seatmap-container') || containerRef.current?.parentElement;
      if (scrollParent) {
        startScrollLeft = scrollParent.scrollLeft;
        startScrollTop = scrollParent.scrollTop;
      }
    });

    canvas.on('mouse:move', (options) => {
      if (!isPanning) return;
      
      const evt = options.e;
      const pos = evt.type === 'touchmove' ? evt.touches[0] : evt;
      const dx = pos.clientX - startX;
      const dy = pos.clientY - startY;

      const scrollParent = containerRef.current?.closest('.mobile-seatmap-container') || containerRef.current?.parentElement;
      if (scrollParent) {
        scrollParent.scrollLeft = startScrollLeft - dx;
        scrollParent.scrollTop = startScrollTop - dy;
      }
    });

    canvas.on('mouse:up', () => {
      isPanning = false;
    });

    canvas.on('mouse:out', () => {
      // isPanning = false; // Optional: stop panning if mouse leaves canvas
    });

    // Real-time subscription for attendance updates
    const channel = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'attendance' 
      }, () => {
        // Reload data when attendance changes
        loadAttendanceData(sessions);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true);
        } else {
          setIsRealtimeConnected(false);
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [activeSession, selectedZoneId, selectedDate, externalSessionId, externalZoneId, externalDate, sessions]);

 
  const loadAttendanceData = async (sessList) => {
    if (!fabricRef.current || !selectedZoneId || !activeSession) return;
    setLoading(true);

    // Fetch seats ONLY for selected zone
    const { data: seats } = await supabase
      .from('seats')
      .select('*')
      .eq('zone_id', selectedZoneId)
      .order('global_number', { ascending: true });

    // Use SELECTED DATE instead of hardcoded today
    const targetDate = selectedDate; 
      const todayKST = getKSTISOString().split('T')[0];
      const isToday = targetDate === todayKST;

      // FETCH 1: All bookings for TARGET DATE
      const { data: allDailyBookings } = await supabase
        .from('bookings')
        .select(`
          *,
          profiles(full_name, username),
          attendance(id, status, timestamp_in, timestamp_out)
        `)
        .eq('date', targetDate);

      // --- AUTO-CHECKOUT LOGIC ---
      if (allDailyBookings && allDailyBookings.length > 0) {
          const nowKSTObj = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
          const currentTimeStr = nowKSTObj.toISOString().split('T')[1].substring(0, 8); // HH:mm:ss
          
          const autoCheckouts = [];
          allDailyBookings.forEach(b => {
              const sess = sessList.find(s => s.id === b.session_id);
              if (!sess) return;
              
              const att = Array.isArray(b.attendance) ? b.attendance[0] : b.attendance;
              if (att && (att.status === 'present' || att.status === 'late') && !att.timestamp_out) {
                  // If session is ended and it's today (or any past session)
                  const sessionEndTime = sess.end_time.length === 5 ? sess.end_time + ':00' : sess.end_time;
                  if (targetDate < todayKST || (isToday && sessionEndTime < currentTimeStr)) {
                      autoCheckouts.push({
                          id: att.id,
                          timestamp_out: `${targetDate}T${sessionEndTime}+09:00`,
                          updated_at: new Date().toISOString()
                      });
                  }
              }
          });

          if (autoCheckouts.length > 0) {
              const { error: batchErr } = await supabase.from('attendance').upsert(autoCheckouts);
              if (!batchErr) {
                  // Update local records to reflect auto-checkout without full re-fetch
                  autoCheckouts.forEach(update => {
                      const b = allDailyBookings.find(db => {
                          const attId = Array.isArray(db.attendance) ? db.attendance[0]?.id : db.attendance?.id;
                          return attId === update.id;
                      });
                      if (b) {
                          if (Array.isArray(b.attendance)) b.attendance[0].timestamp_out = update.timestamp_out;
                          else b.attendance.timestamp_out = update.timestamp_out;
                      }
                  });
              }
          }
      }

      if (fabricRef.current) fabricRef.current.clear();

      // 1. Calculate Bounds
      const allItems = seats || [];
      if (allItems.length === 0) {
        setLoading(false);
        return;
      }
      
      const validX = allItems.map(s => s.pos_x).filter(x => typeof x === 'number' && !isNaN(x));
      const validY = allItems.map(s => s.pos_y).filter(y => typeof y === 'number' && !isNaN(y));

      if (validX.length === 0 || validY.length === 0) {
        setLoading(false);
        return;
      }

      const minX = Math.min(...validX);
      const maxX = Math.max(...allItems.map(s => (s.pos_x + (s.width || 72))).filter(x => !isNaN(x)));
      const minY = Math.min(...validY);
      const maxY = Math.max(...allItems.map(s => (s.pos_y + (s.height || 72))).filter(y => !isNaN(y)));

      const layoutWidth = maxX - minX;
      const layoutHeight = maxY - minY;

      // 2. Set Dynamic Canvas Dimensions with 20px Padding
      const canvasWidth = layoutWidth + 40;
      const canvasHeight = layoutHeight + 40;
      
      // Calculate active offsets to center/fit
      const offsetX = 20 - minX;
      const offsetY = 20 - minY;

      if (fabricRef.current) {
        fabricRef.current.setDimensions({ width: canvasWidth, height: canvasHeight });
        if (containerRef.current) {
          containerRef.current.style.width = `${canvasWidth}px`;
          containerRef.current.style.height = `${canvasHeight}px`;
        }
      }

      // Active Session Object finding (logic depends on if today)
      let actualActiveSession = sessList?.find(s => s.id === activeSession);
      if (!actualActiveSession && isToday) {
          const now = new Date();
          const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
          actualActiveSession = sessList?.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
      }

      let presentCount = 0;
      const activeSessionBookings = allDailyBookings?.filter(b => b.session_id === activeSession) || [];
      const reservedCount = activeSessionBookings.length;

      seats.forEach(seat => {
        if (seat.type === 'structure') {
           renderSeat({
             ...seat,
             pos_x: seat.pos_x + offsetX,
             pos_y: seat.pos_y + offsetY
           }, null, null, [], null, sessList, false, isToday);
           return; 
        }

        const seatBookings = allDailyBookings?.filter(b => b.seat_id === seat.id) || [];
        const currentBooking = seatBookings.find(b => b.session_id === activeSession);
        
        const attRecord = Array.isArray(currentBooking?.attendance) ? currentBooking.attendance[0] : (currentBooking?.attendance || null);
        let status = attRecord?.status || 'absent';
        
        // Local Override for Expired Sessions (Visual Consistency) - Only if Today and no record
        if (isToday && currentBooking && !attRecord && activeSession && sessList) {
             const manualSessionObj = sessList.find(s => s.id === activeSession);
             if (manualSessionObj) {
                  const now = new Date();
                  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
                  if (manualSessionObj.end_time < currentTime) {
                     status = 'absent';
                  }
             }
        }

        const hasAnyBookingToday = seatBookings.length > 0;
        
        if (currentBooking && status === 'present') presentCount++;
        
        renderSeat({
          ...seat,
          pos_x: seat.pos_x + offsetX,
          pos_y: seat.pos_y + offsetY
        }, currentBooking, status, seatBookings, actualActiveSession, sessList, hasAnyBookingToday, isToday);
      });

      setStats({
        present: presentCount,
        absent: reservedCount - presentCount,
        total: reservedCount,
        rate: reservedCount > 0 ? Math.round((presentCount / reservedCount) * 100) : 0
      });

    // Native scrolling handled by container

    setLoading(false);
  };

  const renderSeat = (seatData, booking, status, seatBookings, activeSessionObj, sessList, hasAnyBookingToday, isToday) => {
    // 0. Handle Structural Elements
    if (seatData.type === 'structure') {
      const rect = new fabric.Rect({
        fill: '#E5E5EA',
        width: seatData.width || 72,
        height: seatData.height || 72,
        rx: 12, ry: 12,
        stroke: '#D1D1D6',
        strokeWidth: 1,
      });

      const text = new fabric.IText(seatData.label || '', {
        fontSize: 10,
        originX: 'center', originY: 'center',
        left: (seatData.width || 72) / 2, top: (seatData.height || 72) / 2,
        fill: '#AEAEB2',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
        selectable: false,
      });

      const group = new fabric.Group([rect, text], {
        left: seatData.pos_x,
        top: seatData.pos_y,
        angle: seatData.rotation,
        selectable: false,
        evented: false, 
        data: { ...seatData } 
      });
      
      fabricRef.current.add(group);
      return;
    }

    const isActiveNow = !!booking;
    const isBookedToday = hasAnyBookingToday; 
    const baseColor = seatData.zone_color || '#5E5CE6';

    // 1. Background Square
    const bg = new fabric.Rect({
      fill: '#FFFFFF',
      width: 71, 
      height: 71,
      rx: 12, ry: 12,
      stroke: '#E5E5EA',
      strokeWidth: 1,
      left: 0.5, top: 0.5,
      originX: 'left', originY: 'top',
      selectable: false,
    });

    // 2. Seat Number Header Area (Roof)
    const roofPath = `M 0 12 Q 0 0 12 0 L 60 0 Q 72 0 72 12 L 72 18 L 0 18 z`;
    const headerBg = new fabric.Path(roofPath, {
      fill: baseColor,
      strokeWidth: 0,
      left: 0, top: 0,
      originX: 'left', originY: 'top',
      selectable: false,
    });

    // 3. Status Dot
    let visualItems = [bg, headerBg];
    
    if (isActiveNow) {
        // Find attendance record in a robust way
        const att = Array.isArray(booking?.attendance) ? booking.attendance[0] : (booking?.attendance || null);
        const isActuallyPresent = (status === 'present' || status === 'late') && !att?.timestamp_out;

        const dotColor = isActuallyPresent ? '#00FF00' : '#FF3B30';
        const statusDot = new fabric.Circle({
            radius: 3,
            fill: dotColor,
            left: 58, top: 9,
            originX: 'center', originY: 'center',
            selectable: false,
            stroke: 'rgba(255,255,255,0.8)',
            strokeWidth: 1.5
        });
        visualItems.push(statusDot);
    }

    // 4. Seat Number Text
    const numText = new fabric.IText(seatData.display_number || seatData.seat_number, {
      fontSize: 10,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: '900',
      fill: '#ffffff',
      left: 36, top: 9, 
      originX: 'center', originY: 'center',
      selectable: false,
    });
    visualItems.push(numText);

    // 5. Occupant Info & Split Buttons or Empty Label
    if (isActiveNow) {
        const profile = booking?.profiles;
        const displayName = profile ? `${profile.username ? profile.username + ' ' : ''}${profile.full_name}` : '학적 정보 없음';
        
        const nameText = new fabric.IText(displayName, {
            fontSize: 10,
            textAlign: 'center',
            originX: 'center', originY: 'center',
            left: 36, top: 34, 
            fill: '#1C1C1E', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
            selectable: false,
        });
        visualItems.push(nameText);

        const att = Array.isArray(booking?.attendance) ? booking.attendance[0] : (booking?.attendance || null);
        const hasCheckedOut = !!att?.timestamp_out;
        const isCurrentlyLearning = (status === 'present' || status === 'late') && !hasCheckedOut;
        
        // Full-Cell Split Buttons Logic (3 States)
        let leftLabelStr = '미출석';
        let rightLabelStr = '출석처리';
        let leftLabelColor = '#8E8E93';
        let leftBgFill = '#F2F2F7';
        let rightBgFill = baseColor;
        let rightTextColor = '#FFFFFF';
        let hasStroke = false;

        if (isCurrentlyLearning) {
            leftLabelStr = '학습중';
            rightLabelStr = '퇴실';
            leftLabelColor = '#FFFFFF';
            leftBgFill = baseColor;
            rightBgFill = '#FFFFFF';
            rightTextColor = baseColor;
            hasStroke = true;
        } else if (hasCheckedOut) {
            leftLabelStr = '학습종료';
            rightLabelStr = '결석처리';
            leftLabelColor = '#1C1C1E'; // iOS default label color for better readability
            leftBgFill = '#F2F2F7';
            rightBgFill = baseColor; // Use zone color for the "Undo" action to stand out
            rightTextColor = '#FFFFFF';
        }

        const leftPath = 'M 0 50 L 36 50 L 36 72 L 6 72 Q 0 72 0 66 Z';
        const leftBg = new fabric.Path(leftPath, {
            fill: leftBgFill,
            selectable: false,
        });

        const leftText = new fabric.IText(leftLabelStr, {
            fontSize: 8,
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
            fill: leftLabelColor,
            originX: 'center', originY: 'center',
            left: 18, top: 61,
            selectable: false,
        });

        const rightPath = 'M 36 50 L 72 50 L 72 66 Q 72 72 66 72 L 36 72 Z';
        const rightBg = new fabric.Path(rightPath, {
            fill: rightBgFill,
            stroke: hasStroke ? baseColor : null,
            strokeWidth: hasStroke ? 1 : 0,
            selectable: false,
            hoverCursor: 'pointer',
            name: 'actionButton'
        });

        const rightText = new fabric.IText(rightLabelStr, {
            fontSize: 8,
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
            fill: rightTextColor,
            originX: 'center', originY: 'center',
            left: 54, top: 61,
            selectable: false,
            name: 'actionLabel'
        });

        visualItems.push(leftBg, leftText, rightBg, rightText);
    } else {
        // EMPTY or RESERVED FOR OTHER SESSION
        const emptyLabel = new fabric.IText('공석', {
            fontSize: 12,
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
            fill: '#E5E5EA', // Slightly darker for visibility in dimmed tiers
            left: 36, top: 34,
            originX: 'center', originY: 'center',
            selectable: false,
        });
        
        const footerPath = `M 0 50 L 72 50 L 72 60 Q 72 72 60 72 L 12 72 Q 0 72 0 60 Z`;
        const footerBg = new fabric.Path(footerPath, {
            fill: '#F2F2F7',
            opacity: 0.3,
            selectable: false,
        });
        
        const footerText = new fabric.IText('-', {
            fontSize: 10,
            fill: '#AEAEB2', // Visible gray
            left: 36, top: 61,
            originX: 'center', originY: 'center',
            selectable: false,
        });
        
        visualItems.push(emptyLabel, footerBg, footerText);
    }

    // Determine Group Opacity based on Tiers
    let groupOpacity = 1;
    if (!isActiveNow) {
        groupOpacity = isBookedToday ? 0.4 : 0.15;
    }

    const group = new fabric.Group(visualItems, {
      left: seatData.pos_x,
      top: seatData.pos_y,
      opacity: groupOpacity,
      angle: seatData.rotation,
      data: { ...seatData, booking, status },
      selectable: false,
      hoverCursor: isActiveNow ? 'pointer' : 'default',
      subTargetCheck: true 
    });

    fabricRef.current.add(group);
  };
  
  // Helper to change date
  const changeDate = (days) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + days);
      setSelectedDate(date.toISOString().split('T')[0]);
  };

  // Helper for KST Timestamp
  const getKSTISOString = () => {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstTime = new Date(now.getTime() + kstOffset);
    return kstTime.toISOString().replace('Z', '+09:00');
  };

  const toggleAttendance = async (group) => {
    const { booking, status: currentStatus } = group.data;
    if (!booking) return;
    
    // Find session for time checks
    const session = sessions.find(s => s.id === booking.session_id);
    if (!session) return;

    const att = Array.isArray(booking.attendance) ? booking.attendance[0] : (booking.attendance || null);
    const hasCheckedOut = !!att?.timestamp_out;
    const isCurrentlyLearning = (currentStatus === 'present' || currentStatus === 'late') && !hasCheckedOut;

    if (isCurrentlyLearning) {
        // ACTION: Check Out (Manual)
        const { error } = await supabase.from('attendance')
            .update({
                timestamp_out: getKSTISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', att.id);

        if (error) console.error('Error during check-out:', error);
        if (!error) await loadAttendanceData(sessions); 
    } else if (hasCheckedOut) {
        // ACTION: Reset to Absent (The "결석처리" button)
        const { error } = await supabase.from('attendance')
            .update({
                status: 'absent',
                timestamp_in: null,
                timestamp_out: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', att.id);

        if (error) console.error('Error during reset to absent:', error);
        if (!error) await loadAttendanceData(sessions);
    } else {
        // ACTION: Check In (Admin/Staff always 'present' and fixed start time)
        const sessionStartTime = session?.start_time || '00:00:00';
        const payload = {
            booking_id: booking.id,
            status: 'present', // No 'late' from admin/teacher
            timestamp_in: `${selectedDate}T${sessionStartTime}${sessionStartTime.length === 5 ? ':00' : ''}+09:00`,
            timestamp_out: null, 
            updated_at: new Date().toISOString()
        };

        // If there's an existing row (like 'absent'), include its ID for a solid update
        if (att?.id) {
            payload.id = att.id;
        }

        const { error } = await supabase.from('attendance')
            .upsert(payload, { onConflict: 'booking_id' });
        
        if (error) {
            console.error('Error during attendance upsert:', error);
        } else {
            // Force data reload and redraw - await to ensure sync
            await loadAttendanceData(sessions); 
        }
    }
  };

  const exportToExcel = () => {
    const data = fabricRef.current.getObjects().map(obj => ({
      '좌석ID': obj.data.global_number,
      '좌석번호': obj.data.display_number,
      '학생명': obj.data.booking?.profiles?.full_name || '없음',
      '상태': obj.data.status === 'present' ? '출석' : '결석',
      '구역': obj.data.zone_name,
      '날짜': selectedDate
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "출석부");
    XLSX.writeFile(wb, `출석부_${selectedDate}.xlsx`);
  };

  return (
    <div className={`flex flex-col gap-4 w-full ${isMobileView ? 'min-h-fit' : 'h-full'} pt-[10px]`}>
      {!isMobileView && (
        <>
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between px-2">
            <div className="flex items-center gap-4 ml-[10px] mt-[10px]">
              {/* Zone Selection */}
              <div className="flex gap-[10px] p-1 bg-gray-200/20 rounded-apple-md border border-white/40">
                {zones.map(z => (
                  <button
                    key={z.id}
                    onClick={() => setSelectedZoneId(z.id)}
                    className={`h-7 px-4 rounded-apple-md text-[11px] font-black transition-all ios-tap flex items-center justify-center border-none ${
                      selectedZoneId === z.id ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-ios-gray hover:text-[#1C1C1E] hover:bg-white/40'
                    }`}
                  >
                    {z.name}
                  </button>
                ))}
              </div>


               {/* Date Selection */}
              <div className="flex items-center bg-gray-200/20 p-1 rounded-apple-md border border-white/40 backdrop-blur-xl h-9">
                 <button 
                    onClick={() => changeDate(-1)}
                    className="h-7 px-2.5 rounded-apple-md hover:bg-white text-ios-gray hover:text-[#1C1C1E] transition-all text-[11px] font-black"
                 >
                    &lt;
                 </button>
                 <span className="px-3 text-[12px] font-black min-w-[100px] text-center text-[#1C1C1E]">
                    {selectedDate.substring(5)} ({['일', '월', '화', '수', '목', '금', '토'][new Date(selectedDate).getDay()]})
                 </span>
                 <button 
                    onClick={() => changeDate(1)}
                    className="h-7 px-2.5 rounded-apple-md hover:bg-white text-ios-gray hover:text-[#1C1C1E] transition-all text-[11px] font-black"
                 >
                    &gt;
                 </button>
              </div>

              {/* Session Selection */}
              <div className="flex bg-gray-200/20 p-1 rounded-apple-md border border-white/40 h-9 box-border">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSession(s.id)}
                    className={`h-7 px-5 rounded-apple-md text-[10.5px] font-black transition-all duration-300 ios-tap flex items-center justify-center ${
                      activeSession === s.id ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-ios-gray hover:text-[#1C1C1E] hover:bg-white/40'
                    }`}
                  >
                    {s.name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mr-[10px] mt-[10px]">
              <button 
                onClick={exportToExcel}
                className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-[#1C1C1E] h-8 px-4 rounded-[8px] text-[11px] font-black transition-all border border-gray-100 ios-tap"
              >
                <Download className="w-3.5 h-3.5 text-ios-blue" /> 출석부
              </button>
              <div className="bg-white h-8 px-3 rounded-[8px] shadow-sm border border-gray-100 flex items-center justify-center" title={isRealtimeConnected ? "실시간으로 출결 현황이 업데이트 중입니다." : "실시간 연결 시도 중..."}>
                <div className={`w-2 h-2 rounded-full shrink-0 border border-white shadow-sm transition-all duration-500 ${isRealtimeConnected ? 'bg-emerald-500 animate-pulse shadow-emerald-500/50' : 'bg-rose-500 opacity-80'}`} />
              </div>
            </div>
          </div>
          
          {/* Attendance Stats Badges - RELOCATED TO NEW ROW */}
           <div className="flex items-center gap-2 px-2 ml-[10px] mt-2">
            <div className="flex items-center gap-1.5 bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-apple-md">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30" />
              <span className="text-[10px] font-black text-[#1C1C1E]">출석 <span className="text-emerald-500">{stats.present}</span></span>
            </div>
            <div className="flex items-center gap-1.5 bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-apple-md">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/30" />
              <span className="text-[10px] font-black text-[#1C1C1E]">결석 <span className="text-rose-500">{stats.absent}</span></span>
            </div>
            <div className="flex items-center gap-1.5 bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-apple-md">
                <Users className="w-3.5 h-3.5 text-ios-gray opacity-60" />
                <span className="text-[10px] font-black text-ios-gray">전체 {stats.total}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-apple-md">
                <span className="text-[10px] font-black text-ios-indigo">출석률 {stats.rate}%</span>
            </div>
          </div>
        </>
      )}

      <div className={`${isMobileView ? 'w-full' : 'flex-1 flex flex-col w-full'} overflow-hidden relative`}>
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-3 border-ios-indigo border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        <div className={`${isMobileView ? 'w-full' : 'flex-1 w-full'} bg-white rounded-t-[6px] rounded-b-none border-0 overflow-hidden p-2.5 pb-0`}>
          <div 
            ref={containerRef} 
            className={`relative overflow-hidden cursor-grab active:cursor-grabbing select-none scrollbar-hide ${isMobileView ? 'w-full min-h-[600px] h-auto touch-action-none' : 'flex-1 h-full'}`}
            style={isMobileView ? { touchAction: 'none' } : {}}
          />
        </div>
      </div>
    </div>
  );
};


export default AttendanceManager;

import React, { useEffect, useState, useRef } from 'react';
import { fabric } from 'fabric';
import { supabase } from '../../lib/supabase';
import { Check, X, Clock, UserCheck, Download, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

const AttendanceManager = () => {
  const containerRef = useRef(null);
  const fabricRef = useRef(null);
  const [activeSession, setActiveSession] = useState(1); // Default to Morning
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ present: 0, absent: 0, total: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    let isMounted = true;
    
    // Clean check
    if (fabricRef.current) {
      fabricRef.current.dispose();
    }

    // DOM Isolation: Manually create and append canvas
    containerRef.current.innerHTML = '';
    const canvasEl = document.createElement('canvas');
    containerRef.current.appendChild(canvasEl);

    const canvas = new fabric.Canvas(canvasEl, {
      width: 1000,
      height: 1100,
      backgroundColor: 'transparent',
      selection: false,
    });
    fabricRef.current = canvas;

    const init = async () => {
      const sess = await fetchSessions();
      if (!isMounted) return;
      await loadAttendanceData(sess);
    };

    init();

    canvas.on('mouse:down', (options) => {
      if (options.target && options.target.data) {
        toggleAttendance(options.target);
      }
    });

    return () => {
      isMounted = false;
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [activeSession]);

  const fetchSessions = async () => {
    const { data } = await supabase.from('sessions').select('*');
    if (data) {
      setSessions(data);
      return data;
    }
    return [];
  };

  const loadAttendanceData = async (sessList) => {
    if (!fabricRef.current || !canvasRef.current) return;
    setLoading(true);
    const { data: seats } = await supabase.from('seats').select('*').order('global_number', { ascending: true });
    const today = new Date().toISOString().split('T')[0];
    const { data: attendanceData } = await supabase
      .from('bookings')
      .select('*, attendance(*), profiles(full_name)')
      .eq('date', today)
      .eq('session_id', activeSession);

    if (seats && seats.length > 0 && fabricRef.current) {
      fabricRef.current.clear();
      
      // Horizontal centering
      const minX = Math.min(...seats.map(s => s.pos_x));
      const maxX = Math.max(...seats.map(s => s.pos_x + 72));
      const layoutWidth = maxX - minX;
      const offsetX = (1000 - layoutWidth) / 2 - minX;

      // Vertical dynamic height with 20px padding
      const minY = Math.min(...seats.map(s => s.pos_y));
      const maxY = Math.max(...seats.map(s => s.pos_y + 72));
      const layoutHeight = maxY - minY;
      const offsetY = 20 - minY;
      const containerHeight = containerRef.current?.clientHeight || 0;
      const totalHeight = Math.max(layoutHeight + 40, containerHeight);

      if (fabricRef.current) {
        fabricRef.current.setDimensions({ width: 1000, height: totalHeight });
      }

      const now = new Date();
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
      const actualActiveSession = sessList?.find(s => currentTime >= s.start_time && currentTime <= s.end_time);

      // Filter for stats counting (only real seats)
      const realSeats = seats.filter(s => s.type !== 'structure');
      
      let presentCount = 0;
      
      // Iterate over ALL objects (including structures) for rendering
      seats.forEach(seat => {
        // Skip logic for structures, just render
        if (seat.type === 'structure') {
           renderSeat(seat, null, null, [], null, sessList);
           return; 
        }

        const seatBookings = attendanceData?.filter(b => b.seat_id === seat.id) || [];
        const currentBooking = seatBookings.find(b => b.session_id === activeSession);
        const status = currentBooking?.attendance[0]?.status || 'absent';
        
        if (status === 'present') presentCount++;
        
        renderSeat({
          ...seat,
          pos_x: seat.pos_x + offsetX,
          pos_y: seat.pos_y + offsetY
        }, currentBooking, status, seatBookings, actualActiveSession, sessList);
      });

      setStats({
        present: presentCount,
        absent: realSeats.length - presentCount,
        total: realSeats.length
      });
    }

    if (fabricRef.current && canvasRef.current) {
      fabricRef.current.on('mouse:wheel', (opt) => {
        if (!fabricRef.current || !canvasRef.current) return;
        const delta = opt.e.deltaY;
        const vpt = fabricRef.current.viewportTransform;
        vpt[5] -= delta;
        
        const canvasHeight = fabricRef.current.getHeight();
        const vptHeight = containerRef.current?.clientHeight || 0;
        if (vpt[5] > 0) vpt[5] = 0;
        if (vptHeight > 0 && vpt[5] < -(canvasHeight - vptHeight)) vpt[5] = -(canvasHeight - vptHeight);

        fabricRef.current.requestRenderAll();
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });
    }

    setLoading(false);
  };

  const renderSeat = (seatData, booking, status, seatBookings, activeSessionObj, sessList) => {
    // 0. Handle Structural Elements
    if (seatData.type === 'structure') {
      const rect = new fabric.Rect({
        fill: '#E5E5EA',
        width: seatData.width || 72,
        height: seatData.height || 72,
        rx: 6, ry: 6,
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
      
      // Handle Text Scaling for Structures (same as Editor)
      // Actually we just render static here, no scaling needed usually unless we want perfection.
      // But we must group them properly.

      const group = new fabric.Group([rect, text], {
        left: seatData.pos_x,
        top: seatData.pos_y,
        angle: seatData.rotation,
        selectable: false,
        evented: false, 
        data: { ...seatData } // Pass data just in case
      });
      
      fabricRef.current.add(group);
      return;
    }

    const isBooked = !!booking;
    
    const baseColor = seatData.zone_color || '#5E5CE6';
    const color = status === 'present' ? '#30D158' : (isBooked ? '#FF9F0A' : '#1C1C1E'); 

    const rect = new fabric.Rect({
      fill: isBooked ? color : baseColor,
      opacity: isBooked ? 1 : 0.25,
      width: 72,
      height: 72,
      rx: 6, ry: 6,
      stroke: status === 'present' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
      strokeWidth: 2,
    });

    const text = new fabric.IText(seatData.display_number || seatData.seat_number, {
      fontSize: 12,
      left: 6, top: 6,
      fill: isBooked ? '#ffffff' : '#48484A',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: '900',
      selectable: false,
    });

    const nameText = new fabric.IText(booking?.profiles?.full_name || (isBooked ? 'Reserved' : ''), {
      fontSize: 10,
      textAlign: 'center',
      originX: 'center', originY: 'center',
      left: 36, top: 36,
      fill: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: '600',
      selectable: false,
    });

    // 4 Session Indicators
    const indicators = sessList.map((sess, idx) => {
      const isSessBooked = seatBookings?.some(b => b.session_id === sess.id);
      const isSessActive = sess.id === activeSessionObj?.id;
      
      return new fabric.Rect({
        left: 6 + (idx * 15), 
        top: 60,
        width: 12,
        height: 4,
        rx: 1, ry: 1,
        fill: isSessBooked ? (isSessActive ? '#30D158' : '#ffffff') : 'rgba(255,255,255,0.1)',
        selectable: false
      });
    });

    const group = new fabric.Group([rect, text, nameText, ...indicators], {
      left: seatData.pos_x,
      top: seatData.pos_y,
      angle: seatData.rotation,
      data: { ...seatData, booking, status },
      selectable: false,
      hoverCursor: isBooked ? 'pointer' : 'default'
    });

    fabricRef.current.add(group);
  };

  const toggleAttendance = async (group) => {
    const { booking, status } = group.data;
    if (!booking) return;

    const newStatus = status === 'present' ? 'absent' : 'present';
    const { error } = await supabase.from('attendance').upsert({
      booking_id: booking.id,
      status: newStatus,
      timestamp_in: newStatus === 'present' ? new Date().toISOString() : null
    }, { onConflict: 'booking_id' });

    if (!error) loadAttendanceData();
  };

  const exportToExcel = () => {
    const data = fabricRef.current.getObjects().map(obj => ({
      '좌석ID': obj.data.global_number,
      '좌석번호': obj.data.display_number,
      '학생명': obj.data.booking?.profiles?.full_name || '없음',
      '상태': obj.data.status === 'present' ? '출석' : '결석',
      '구역': obj.data.zone_name
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "출석부");
    XLSX.writeFile(wb, `출석부_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full p-0">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex bg-gray-50 p-1 rounded-[6px] border border-gray-100">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`px-6 py-2 rounded-[6px] text-[10px] font-black transition-all duration-300 ios-tap ${
                activeSession === s.id ? 'bg-white text-ios-indigo shadow-sm' : 'text-ios-gray hover:text-[#1C1C1E]'
              }`}
            >
              {s.name.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-[#1C1C1E] px-4 py-2 rounded-[6px] text-xs font-black transition-all border border-gray-100 ios-tap"
          >
            <Download className="w-4 h-4 text-ios-blue" /> 명단 저장
          </button>
          <div className="bg-white px-4 py-2 rounded-[6px] text-xs font-black shadow-sm border border-gray-100 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-ios-indigo animate-pulse" />
            LIVE
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-6 w-full overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-3 border-ios-indigo border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        <div className="flex-1 w-full bg-white rounded-t-[6px] rounded-b-none border-0 overflow-hidden p-2.5 pb-0">
          {/* 
              Canvas Host: Isolated from React reconciliation.
              Fabric.js will wrap the manually injected canvas here.
          */}
          <div 
            ref={containerRef} 
            className="flex-1 h-full relative overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none scrollbar-hide"
          />
        </div>
      </div>

        <div className="w-full xl:w-80 h-full overflow-y-auto scrollbar-hide space-y-6">
          <div className="bg-white rounded-[6px] border border-gray-100 p-6 space-y-6 shadow-sm">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-ios-gray flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-ios-blue" /> 실시간 출결 현황
            </h4>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[6px]">
                <p className="text-[9px] uppercase font-black text-ios-emerald mb-1 tracking-widest">출석 인원</p>
                <p className="text-4xl font-black text-[#1C1C1E]">{stats.present}<span className="text-sm text-ios-emerald/70 ml-1">명</span></p>
              </div>
              <div className="bg-rose-50 border border-rose-100 p-5 rounded-[6px]">
                <p className="text-[9px] uppercase font-black text-ios-rose mb-1 tracking-widest">결석 / 미지정</p>
                <p className="text-4xl font-black text-[#1C1C1E]">{stats.absent}<span className="text-sm text-ios-rose/70 ml-1">명</span></p>
              </div>
              <div className="bg-gray-50 border border-gray-100 p-5 rounded-[6px]">
                <p className="text-[9px] uppercase font-black text-ios-gray mb-1 tracking-widest">전체 좌석</p>
                <p className="text-2xl font-black text-[#1C1C1E]">{stats.total}<span className="text-[10px] text-ios-gray ml-1">SEATS</span></p>
              </div>
            </div>
          </div>

          <div className="bg-ios-amber/10 border border-ios-amber/20 p-6 rounded-[6px] text-[#1C1C1E] ios-tap relative overflow-hidden">
             <div className="relative z-10">
               <Clock className="w-8 h-8 mb-4 text-ios-amber" />
               <h4 className="font-black text-lg mb-1 tracking-tight">자동 동기화</h4>
               <p className="text-[11px] font-medium leading-relaxed text-ios-gray">학생 및 학부모 화면에 즉시 반영됩니다.</p>
             </div>
             <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-ios-amber/5 rounded-full blur-xl" />
          </div>
        </div>
      </div>
    </div>
  );
};


export default AttendanceManager;

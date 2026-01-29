import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { supabase } from '../../lib/supabase';
import { Search, Info, Map as MapIcon } from 'lucide-react';

const SeatBookingMap = ({ onSelectSeat }) => {
  const containerRef = useRef(null);
  const fabricRef = useRef(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // 1. Get current user profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!isMounted) return;
        setCurrentUser(profile);
      }

      // 2. Load sessions
      const { data: sess } = await supabase.from('sessions').select('*').order('start_time', { ascending: true });
      if (!isMounted) return;
      setSessions(sess || []);

      // 3. Setup Canvas (DOM Isolation Pattern)
      if (!containerRef.current) return;

      // Clean check: Dispose old instance
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
      
      // Manually manage the canvas element to isolate it from React reconciliation
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

      await loadData(canvas, sess, user);
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
          onSelectSeat(seatData);
          
          canvas.getObjects().forEach(obj => {
            if (obj.type === 'group') {
              obj.item(0).set('stroke', 'rgba(255,255,255,0.1)');
            }
          });
          options.target.item(0).set('stroke', '#ffffff');
          options.target.item(0).set('strokeWidth', 3);
          canvas.renderAll();
        } else {
          setSelectedSeat(null);
          onSelectSeat(null);
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
  }, []);

  const loadData = async (canvas, sessList, user) => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch seats
    const { data: seats } = await supabase.from('seats').select('*').order('global_number', { ascending: true });
    
    // Fetch ALL today's bookings with profile info
    const { data: todayBookings } = await supabase
      .from('bookings')
      .select('*, profiles(username, full_name)')
      .eq('date', today);

    if (seats && seats.length > 0) {
      canvas.clear();
      
      const minX = Math.min(...seats.map(s => s.pos_x));
      const maxX = Math.max(...seats.map(s => s.pos_x + (s.width || 72)));
      const layoutWidth = maxX - minX;
      
      // Expand canvas to container width to fill the white card area
      const parentWidth = containerRef.current?.clientWidth || layoutWidth;
      const totalCanvasWidth = Math.max(layoutWidth, parentWidth);
      const offsetX = (totalCanvasWidth - layoutWidth) / 2 - minX;

      const minY = Math.min(...seats.map(s => s.pos_y));
      const maxY = Math.max(...seats.map(s => s.pos_y + (s.height || 72)));
      const layoutHeight = maxY - minY;
      const offsetY = -minY; // 0px top padding
      
      const containerHeight = containerRef.current?.clientHeight || 0;
      const totalCanvasHeight = Math.max(layoutHeight, containerHeight); 

      canvas.setDimensions({ width: totalCanvasWidth, height: totalCanvasHeight });

      const now = new Date();
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':00';
      
      // Determine current active session
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

      const group = new fabric.Group([rect, text], {
        left: seatData.pos_x,
        top: seatData.pos_y,
        angle: seatData.rotation,
        selectable: false,
        evented: false, // Not interactive
        data: { ...seatData } // Pass data just in case
      });
      
      canvas.add(group);
      return;
    }

    const currentBooking = seatBookings.find(b => b.session_id === activeSession?.id);
    const isActiveNow = !!currentBooking;
    
    // Role-based visibility
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
      opacity: isActiveNow ? 1 : 0.25,
      width: 72,
      height: 72,
      rx: 6, ry: 6,
      stroke: 'rgba(255,255,255,0.1)',
      strokeWidth: 2,
    });

    // 2. Seat Number (Top-left, 12px)
    const numText = new fabric.IText(seatData.display_number || seatData.seat_number, {
      fontSize: 12,
      left: 6, top: 6,
      fill: isActiveNow ? '#ffffff' : '#1C1C1E',
      fontFamily: 'Inter, -apple-system', fontWeight: '900',
      selectable: false,
    });

    // 3. User Info (Center)
    let displayInfo = '';
    if (isActiveNow) {
      if (canSeeDetails(currentBooking)) {
        displayInfo = `${currentBooking.profiles.username}\n${currentBooking.profiles.full_name}`;
      } else {
        displayInfo = '예약됨';
      }
    } else if (seatBookings.length > 0) {
      displayInfo = '...';
    }

    const infoText = new fabric.IText(displayInfo, {
      fontSize: 10,
      textAlign: 'center',
      originX: 'center', originY: 'center',
      left: 36, top: 36,
      fill: isActiveNow ? '#ffffff' : '#1C1C1E',
      fontFamily: 'Inter, -apple-system', fontWeight: '600',
      selectable: false,
      opacity: isActiveNow ? 1 : 0.8
    });

    // 4. Session Indicators (Bottom)
    const indicators = sessList.map((sess, idx) => {
      const isBooked = seatBookings.some(b => b.session_id === sess.id);
      const isCurrent = sess.id === activeSession?.id;
      
      return new fabric.Rect({
        left: 6 + (idx * 15), 
        top: 60,
        width: 12,
        height: 4,
        rx: 1, ry: 1,
        fill: isBooked ? (isCurrent ? '#30D158' : (isActiveNow ? '#ffffff' : '#8E8E93')) : (isActiveNow ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)'),
        stroke: isCurrent ? 'rgba(48, 209, 88, 0.5)' : null,
        strokeWidth: isCurrent ? 1 : 0
      });
    });

    const group = new fabric.Group([bg, numText, infoText, ...indicators], {
      left: seatData.pos_x,
      top: seatData.pos_y,
      angle: seatData.rotation,
      data: { ...seatData, seatBookings, activeSession },
      selectable: false,
      hoverCursor: 'pointer'
    });

    canvas.add(group);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full relative overflow-hidden">
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

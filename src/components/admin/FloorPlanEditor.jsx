import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { Trash2, RotateCw, Plus, Save, Square, MousePointer2, Hash, Palette, Grid, LayoutTemplate } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const FloorPlanEditor = () => {
  const containerRef = useRef(null);
  const fabricRef = useRef(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatNumber, setSeatNumber] = useState('');
  const [displayNumber, setDisplayNumber] = useState('');
  const [zoneName, setZoneName] = useState('A');
  const [zoneColor, setZoneColor] = useState('#5E5CE6');
  
  // Style states for structures
  const [bgColor, setBgColor] = useState('#E5E5EA');
  const [strokeColor, setStrokeColor] = useState('#D1D1D6');
  const [textColor, setTextColor] = useState('#8E8E93');
  const [fontSize, setFontSize] = useState(12);
  
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creationMode, setCreationMode] = useState(null); // 'structure' or null
  const [drawStart, setDrawStart] = useState(null);
  const [tempRect, setTempRect] = useState(null);
  const [history, setHistory] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);

  const centerLayout = (targetCanvas) => {
    const canvas = targetCanvas || fabricRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();
    if (objects.length === 0) return;

    // Calculate bounding box of all objects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach(obj => {
        const bound = obj.getBoundingRect(true);
        minX = Math.min(minX, bound.left);
        minY = Math.min(minY, bound.top);
        maxX = Math.max(maxX, bound.left + bound.width);
        maxY = Math.max(maxY, bound.top + bound.height);
    });

    const layoutWidth = maxX - minX;
    const layoutHeight = maxY - minY;
    
    // Get current container size
    const vptWidth = containerRef.current?.clientWidth || canvas.getWidth();
    const vptHeight = containerRef.current?.clientHeight || canvas.getHeight();

    // Calculate viewport offset to center the layout
    // Center point of layout: (minX + layoutWidth/2)
    // Center point of screen: (vptWidth / 2)
    const offsetX = (vptWidth / 2) - (minX + layoutWidth / 2);
    const offsetY = (vptHeight / 2) - (minY + layoutHeight / 2);

    canvas.setViewportTransform([1, 0, 0, 1, offsetX, offsetY]);
    canvas.requestRenderAll();
  };

  const saveToHistory = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    
    // Use getObjects() but we need to deal with coordinates carefully
    // Since we now have a global coordinate system, obj.left/top ARE the true coordinates.
    const currentState = canvas.getObjects().map(obj => {
        const data = obj.data || {};
        return {
            id: data.id,
            seatNumber: data.seatNumber,
            displayNumber: data.displayNumber,
            zoneName: data.zoneName,
            zoneColor: data.zoneColor,
            pos_x: obj.left,
            pos_y: obj.top,
            width: obj.width,
            height: obj.height,
            label: data.label,
            type: data.type,
            rotation: obj.angle,
            globalNumber: data.globalNumber
        };
    });
    
    setHistory(prev => [...prev.slice(-19), currentState]); // Keep last 20 states
  };
  
  // Refs for event handlers
  const creationModeRef = useRef(null);
  const drawStartRef = useRef(null);
  const tempRectRef = useRef(null);
  const clipboardRef = useRef(null);

  // Sync state to ref for event handlers
  useEffect(() => {
    creationModeRef.current = creationMode;
    drawStartRef.current = drawStart;
    tempRectRef.current = tempRect;
  }, [creationMode, drawStart, tempRect]);

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    const { data } = await supabase.from('zones').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data && data.length > 0) {
      setZones(data);
      setSelectedZoneId(data[0].id);
    }
  };

  useEffect(() => {
    if (!containerRef.current || !selectedZoneId) return;
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
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      backgroundColor: 'transparent',
      selection: true,
    });

    fabricRef.current = canvas;

    // Resize Observer for Auto-Centering
    const resizeObserver = new ResizeObserver(() => {
        if (!containerRef.current || !fabricRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        fabricRef.current.setDimensions({ width, height });
        centerLayout(fabricRef.current);
    });
    resizeObserver.observe(containerRef.current);

    const loadSeats = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('seats')
        .select('*')
        .eq('zone_id', selectedZoneId)
        .order('global_number', { ascending: true });
      
      if (!isMounted) return;

      if (error) {
        console.error('Error loading seats:', error);
      } else if (data && data.length > 0) {
        if (fabricRef.current) fabricRef.current.clear();
        
        // Filter valid data
        const validSeats = data.filter(s => typeof s.pos_x === 'number' && typeof s.pos_y === 'number');
        
        validSeats.forEach(s => {
          renderSeat(s);
          // Ensuring clean state on load
          const obj = fabricRef.current.getObjects().find(o => o.data.id === s.id);
          if (obj) {
             delete obj.data.isDirty;
          }
        });

        // Initial Centering
        setTimeout(() => {
            if (isMounted) centerLayout(fabricRef.current);
        }, 100);

        fabricRef.current.renderAll();
      } else {
        if (fabricRef.current) {
          fabricRef.current.clear();
        }
      }
      setLoading(false);
    };

    loadSeats();

    canvas.on('mouse:down', (options) => {
      // 1. Structure Creation Mode
      if (creationModeRef.current === 'structure') {
        // Disable selection during creation
        canvas.selection = false;
          
        const pointer = canvas.getPointer(options.e);
        setDrawStart({ x: pointer.x, y: pointer.y });
        
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: '#E5E5EA', // Light gray standard
          rx: 6, ry: 6,
          stroke: '#C7C7CC',
          strokeWidth: 1,
          opacity: 0.7
        });
        canvas.add(rect);
        setTempRect(rect);
        return; // Skip other interactions
      }

      // 2. Normal Mode
      // Pan if background is clicked (no target)
      if (!options.target) {
        canvas.isDragging = true;
        canvas.selection = true;
        canvas.lastPosX = options.e.clientX || options.e.touches?.[0]?.clientX;
        canvas.lastPosY = options.e.clientY || options.e.touches?.[0]?.clientY;
      } else {
        // Capture state BEFORE modification for undo
        saveToHistory();
      }
    });

    const undo = async () => {
      if (history.length === 0) return;
      
      const prevState = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      setHistory(newHistory);
      
      // Use setDeletedIds to revert deletedIds if needed? 
      // Actually, maintaining deletedIds history is complex. 
      // For now, simpler undo just restores visual state. 
      // Ideally, history should store the entire state including deletedIds.
      // But let's keep it simple: Just Restore Canvas. DB is untouched.

      // 1. Re-render canvas
      fabricRef.current.clear();
      prevState.forEach(s => {
        renderSeat({
          id: s.id,
          seat_number: s.seatNumber,
          display_number: s.displayNumber,
          zone_name: s.zoneName,
          zone_color: s.zoneColor,
          pos_x: s.pos_x,
          pos_y: s.pos_y,
          width: s.width,
          height: s.height,
          label: s.label,
          type: s.type,
          rotation: s.rotation,
          global_number: s.globalNumber
        });
      });
    };

    const copy = () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
         // Include 'data' in cloning
         activeObject.clone((cloned) => {
            clipboardRef.current = cloned;
         }, ['data']);
      }
    };

    const paste = () => {
      if (!clipboardRef.current || !fabricRef.current) return;
      const canvas = fabricRef.current; 

      saveToHistory();
      
      try {
        // CRITICAL: Second argument ['data'] ensures custom data is preserved!
        clipboardRef.current.clone((clonedObj) => {
            if (!canvas.getElement() || !canvas.contextContainer) return;

            canvas.discardActiveObject();
            
            clonedObj.set({
                left: clonedObj.left + 20,
                top: clonedObj.top + 20,
                evented: true,
            });
            
            if (clonedObj.type === 'activeSelection') {
                const newObjects = [];
                
                clonedObj.forEachObject((obj) => {
                    const newId = crypto.randomUUID();
                    let isStructure = obj.data?.type === 'structure';
                    if (!isStructure && obj.data?.label) isStructure = true;
                    
                    const baseData = obj.data || {};
                    
                    if (isStructure) {
                        delete baseData.zoneName;
                        delete baseData.zoneColor;
                        delete baseData.displayNumber;
                    }

                    obj.set('data', { 
                      ...baseData, 
                      id: newId, 
                      isDirty: true,
                      type: isStructure ? 'structure' : 'seat',
                      seatNumber: baseData.seatNumber || (isStructure ? `STR_${newId.slice(-8)}` : '0')
                    });
                    
                    canvas.add(obj);
                    newObjects.push(obj);
                });
                
                const selection = new fabric.ActiveSelection(newObjects, { canvas: canvas });
                canvas.setActiveObject(selection);
                selection.setCoords();
                
            } else {
                 const newId = crypto.randomUUID();
                 let isStructure = clonedObj.data?.type === 'structure';
                 if (!isStructure && clonedObj.data?.label) isStructure = true;
                 
                 if (isStructure) {
                     const currentLabel = clonedObj.data?.label || '구조물';
                     const newName = prompt('복사된 공간요소 이름', currentLabel);
                     if (newName) {
                          clonedObj.data = { ...clonedObj.data, label: newName, type: 'structure' };
                          const textObj = clonedObj.getObjects().find(o => o.type === 'i-text');
                          if (textObj) textObj.set('text', newName);
                     }
                 }
                 
                 const baseData = clonedObj.data || {};
                 if (isStructure) {
                     delete baseData.zoneName;
                     delete baseData.zoneColor;
                     delete baseData.displayNumber;
                 }

                 clonedObj.set('data', { 
                     ...baseData, 
                     id: newId, 
                     isDirty: true, 
                     type: isStructure ? 'structure' : 'seat',
                     seatNumber: isStructure 
                          ? `STR_${newId.slice(-8)}` 
                          : (baseData.seatNumber || '0') 
                 });
                 
                 canvas.add(clonedObj);
                 canvas.setActiveObject(clonedObj);
            }
            
            canvas.requestRenderAll();
        }, ['data']);
      } catch (err) {
        console.error('Error pasting objects:', err);
      }
    };

    // Keyboard Listener
    const handleKeyDown = (e) => {
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // checks if focused on input to avoid messing up text editing
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
           e.preventDefault();
           copy();
        }
      }
      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
           e.preventDefault();
           paste();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    canvas.on('mouse:move', (options) => {
      if (creationModeRef.current === 'structure' && drawStartRef.current && tempRectRef.current) {
        const pointer = canvas.getPointer(options.e);
        const start = drawStartRef.current;
        const rect = tempRectRef.current;

        const w = Math.abs(pointer.x - start.x);
        const h = Math.abs(pointer.y - start.y);
        
        const left = Math.min(pointer.x, start.x);
        const top = Math.min(pointer.y, start.y);

        rect.set({ width: w, height: h, left: left, top: top });
        canvas.requestRenderAll();
        return;
      }

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
      canvas.requestRenderAll();
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

     // Handle scaling - keep text consistent size (Visual only)
     // Handle scaling - keep text consistent size (Visual only)
     // Generalized for BOTH structure and seat types
     canvas.on('object:scaling', (e) => {
       const target = e.target;
       if (!target) return;
       
       // Apply to any group with data (Structure or Seat)
       if (target.data) {
          const textObj = target.getObjects().find(o => o.type === 'i-text');
          if (textObj) {
             // Inversely scale text to counteract group scaling
             textObj.set({
                scaleX: 1 / target.scaleX,
                scaleY: 1 / target.scaleY
             });
          }
       }
     });
 
     // Double-Click to Edit Text
     canvas.on('mouse:dblclick', (e) => {
        const target = e.target;
        if (!target || !target.data) return; 
        
        const type = target.data.type;
        if (type !== 'seat' && type !== 'structure') return;

        const textObj = target.getObjects().find(o => o.type === 'i-text');
        if (!textObj) return;

        saveToHistory();

        // 1. Save Group Data
        const groupData = { ...target.data };
        const groupLeft = target.left;
        const groupTop = target.top;
        const groupAngle = target.angle;
        
        // 2. Temporarily Release Group to Edit Text
        target._restoreObjectsState();
        canvas.remove(target);
        
        target.getObjects().forEach(obj => {
            canvas.add(obj);
            if (obj === textObj) {
                canvas.setActiveObject(obj);
                obj.enterEditing();
                obj.selectAll();
            }
        });
        
        canvas.requestRenderAll();

        // 3. Regroup on Exit
        textObj.on('editing:exited', () => {
             const newLabel = textObj.text;
             if (type === 'structure') groupData.label = newLabel;
             if (type === 'seat') groupData.displayNumber = newLabel;

             const rect = target.getObjects().find(o => o.type === 'rect');
             const items = [rect, textObj];
             
             items.forEach(i => canvas.remove(i));
             
             const newGroup = new fabric.Group(items, {
                 left: groupLeft,
                 top: groupTop,
                 angle: groupAngle,
                 hasControls: true,
                 lockRotation: false,
                 subTargetCheck: true 
             });
             
             newGroup.data = groupData;
             newGroup.data.isDirty = true;

             if (type === 'seat') {
                 newGroup.set({
                    borderColor: groupData.zoneColor || '#5E5CE6',
                    cornerColor: 'white',
                    cornerStrokeColor: '#5E5CE6',
                    transparentCorners: false,
                 });
             } else {
                 newGroup.set({
                     borderColor: '#007AFF',
                     cornerColor: 'white',
                     cornerStrokeColor: '#007AFF',
                     transparentCorners: false
                 });
             }
             
             canvas.add(newGroup);
             canvas.setActiveObject(newGroup);
             canvas.requestRenderAll();
             
             textObj.off('editing:exited');
        });
     });

     canvas.on('mouse:up', () => {
       if (creationModeRef.current === 'structure' && tempRectRef.current) {
         // Finalize structure creation
         const rect = tempRectRef.current;
         const width = rect.width;
         const height = rect.height;
         const left = rect.left;
         const top = rect.top;
         
         canvas.remove(rect); // Remove temp visual
         setTempRect(null);
         setDrawStart(null);
         setCreationMode(null); // Reset mode
 
         // Minimal size check
         if (width > 20 && height > 20) {
           setTimeout(() => {
              const name = prompt('공간요소 이름 (예: 출입문, 벽, 책상)', '구조물');
              if (name) {
                saveToHistory();
                createStructure(left, top, width, height, name);
              }
           }, 50);
         }
         return;
       }
 
       if (canvas.isDragging) {
         canvas.setViewportTransform(canvas.viewportTransform);
         canvas.isDragging = false;
       }
     });
 
      canvas.on('selection:created', (e) => {
        const selected = e.selected;
        if (selected.length === 1) {
          const obj = selected[0];
          setSelectedSeat(obj);
          if (obj.data?.type === 'structure') {
            setBgColor(obj.data.bgColor || '#E5E5EA');
            setStrokeColor(obj.data.strokeColor || '#D1D1D6');
            setTextColor(obj.data.textColor || '#8E8E93');
            setFontSize(obj.data.fontSize || 12);
          } else {
            setSeatNumber(obj.data?.seatNumber || '');
            setDisplayNumber(obj.data?.displayNumber || '');
            setZoneName(obj.data?.zoneName || 'A');
            setZoneColor(obj.data?.zoneColor || '#5E5CE6');
          }
        } else {
          setSelectedSeat(null);
        }
      });
      
      canvas.on('selection:updated', (e) => {
        const selected = e.selected;
        if (selected.length === 1) {
          const obj = selected[0];
          setSelectedSeat(obj);
          if (obj.data?.type === 'structure') {
            setBgColor(obj.data.bgColor || '#E5E5EA');
            setStrokeColor(obj.data.strokeColor || '#D1D1D6');
            setTextColor(obj.data.textColor || '#8E8E93');
            setFontSize(obj.data.fontSize || 12);
          } else {
            setSeatNumber(obj.data?.seatNumber || '');
            setDisplayNumber(obj.data?.displayNumber || '');
            setZoneName(obj.data?.zoneName || 'A');
            setZoneColor(obj.data?.zoneColor || '#5E5CE6');
          }
        } else {
          setSelectedSeat(null);
        }
      });
  
      canvas.on('selection:cleared', () => {
        setSelectedSeat(null);
        setSeatNumber('');
        setDisplayNumber('');
        setBgColor('#E5E5EA');
        setStrokeColor('#D1D1D6');
        setTextColor('#8E8E93');
        setFontSize(12);
      });
 
     canvas.on('object:modified', async (e) => {
       const target = e.target;
       if (!target) return;
 
       const objectsToUpdate = target.type === 'activeSelection' 
         ? target.getObjects() 
         : [target];
 
       // Start of "Bake Scale" Logic
       objectsToUpdate.forEach(obj => {
          // Apply to BOTH structure and seat
         if (obj.data) {
             // Bake scale into width/height
             const scaledWidth = obj.width * obj.scaleX;
             const scaledHeight = obj.height * obj.scaleY;
             
             obj.set({
                 width: scaledWidth,
                 height: scaledHeight,
                 scaleX: 1,
                 scaleY: 1
             });
             
             // Reset text scale to 1 (since group scale is now 1)
             const textObj = obj.getObjects().find(o => o.type === 'i-text');
             if (textObj) {
                 textObj.set({ scaleX: 1, scaleY: 1 });
                 
                 // Type-specific positioning
                 if (obj.data?.type === 'structure') {
                     // Center for structures
                     textObj.set({
                         left: 0,
                         top: 0,
                         originX: 'center',
                         originY: 'center'
                     });
                 } else {
                     // Top-Left for seats (with padding)
                     // Group center is (0,0). Top-Left is (-w/2, -h/2).
                     textObj.set({
                         left: -scaledWidth / 2 + 6,
                         top: -scaledHeight / 2 + 6,
                         originX: 'left',
                         originY: 'top'
                     });
                 }

                  // Also resize the background rect
                  const rect = obj.getObjects().find(o => o.type === 'rect');
                  if (rect) {
                      rect.set({ width: scaledWidth, height: scaledHeight });
                      // Center relative to group (Fabric groups are center-origin)
                      rect.set({
                         left: -scaledWidth / 2,
                         top: -scaledHeight / 2
                      });
                  }
                 
                 obj.addWithUpdate(); // Recalculate group coords
             }
          }
          
          if (obj.data) obj.data.isDirty = true;
       });
       // End of "Bake Scale" Logic
 
       // Explicit Save Mode: No DB calls here.
     });

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [selectedZoneId]); // Re-run when zone changes

  const createStructure = (x, y, w, h, label) => {
    const rect = new fabric.Rect({
      fill: bgColor,
      width: w,
      height: h,
      rx: 6, ry: 6,
      stroke: strokeColor,
      strokeWidth: 1,
    });

    const text = new fabric.IText(label, {
      fontSize: fontSize,
      originX: 'center', originY: 'center',
      left: w / 2, top: h / 2,
      fill: textColor,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
      selectable: false,
    });
    
    const newId = crypto.randomUUID();

    const group = new fabric.Group([rect, text], {
      left: x,
      top: y,
      originX: 'left',
      originY: 'top',
      perPixelTargetFind: true,
      data: { 
        id: newId, 
        type: 'structure',
        label: label,
        width: w, 
        height: h,
        bgColor,
        strokeColor,
        textColor,
        fontSize,
        isDirty: true,
        seatNumber: `STR_${newId.slice(-8)}`
      }
    });

    fabricRef.current.add(group);
    fabricRef.current.setActiveObject(group);
  };

  const renderSeat = (seatData) => {
    if (seatData.type === 'structure') {
      const rect = new fabric.Rect({
        fill: seatData.bg_color || '#E5E5EA',
        width: seatData.width || 72,
        height: seatData.height || 72,
        rx: 6, ry: 6,
        stroke: seatData.stroke_color || '#D1D1D6',
        strokeWidth: 1,
      });

      const text = new fabric.IText(seatData.label || '구조물', {
        fontSize: seatData.font_size || 12,
        originX: 'center', originY: 'center',
        left: (seatData.width || 72) / 2, top: (seatData.height || 72) / 2,
        fill: seatData.text_color || '#8E8E93',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: 'bold',
        selectable: false,
      });

      const group = new fabric.Group([rect, text], {
        id: seatData.id,
        left: seatData.pos_x,
        top: seatData.pos_y,
        originX: 'left',
        originY: 'top',
        angle: seatData.rotation,
        perPixelTargetFind: true,
        data: { 
          id: seatData.id, 
          type: 'structure',
          label: seatData.label,
          width: seatData.width,
          height: seatData.height,
          bgColor: seatData.bg_color,
          strokeColor: seatData.stroke_color,
          textColor: seatData.text_color,
          fontSize: seatData.font_size
        }
      });
      fabricRef.current.add(group);
      return;
    }

    // Standard Seat Rendering
    const seat = new fabric.Rect({
      fill: seatData.zone_color || '#5E5CE6',
      width: 72,
      height: 72,
      rx: 6, ry: 6,
      stroke: 'rgba(255,255,255,0.1)',
      strokeWidth: 2,
    });

    const text = new fabric.IText(seatData.display_number || seatData.seat_number, {
      fontSize: 12,
      left: 6, top: 6,
      fill: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: '900',
      selectable: false,
    });

    const group = new fabric.Group([seat, text], {
      left: seatData.pos_x,
      top: seatData.pos_y,
      originX: 'left',
      originY: 'top',
      angle: seatData.rotation,
      perPixelTargetFind: true,
      data: { 
        id: seatData.id, 
        type: 'seat',
        seatNumber: seatData.seat_number, 
        displayNumber: seatData.display_number,
        zoneName: seatData.zone_name,
        zoneColor: seatData.zone_color,
        globalNumber: seatData.global_number
      }
    });

    fabricRef.current.add(group);
  };

  const updateSeatProperties = () => {
    if (selectedSeat) {
      saveToHistory();
      
      if (selectedSeat.data?.type === 'structure') {
        selectedSeat.set('data', {
          ...selectedSeat.data,
          bgColor,
          strokeColor,
          textColor,
          fontSize,
          isDirty: true
        });

        const rect = selectedSeat.getObjects().find(obj => obj.type === 'rect');
        if (rect) {
          rect.set({ fill: bgColor, stroke: strokeColor });
        }

        const textObj = selectedSeat.getObjects().find(obj => obj.type === 'i-text');
        if (textObj) {
          textObj.set({ fill: textColor, fontSize: fontSize });
        }
      } else {
        selectedSeat.set('data', { 
          ...selectedSeat.data, 
          seatNumber, 
          displayNumber, 
          zoneName, 
          zoneColor,
          isDirty: true
        });
        
        const rect = selectedSeat.getObjects().find(obj => obj.type === 'rect');
        if (rect) rect.set('fill', zoneColor);

        const textObj = selectedSeat.getObjects().find(obj => obj.type === 'i-text');
        if (textObj) textObj.set('text', displayNumber);
      }
      
      fabricRef.current.renderAll();
    }
  };

  const addSeat = () => {
    saveToHistory();
    const nextNum = fabricRef.current.getObjects().filter(o => o.data?.type !== 'structure').length + 1;
    const sName = `${nextNum}`;

    const seat = new fabric.Rect({
      fill: zoneColor,
      width: 72,
      height: 72,
      rx: 6, ry: 6,
      stroke: 'rgba(255,255,255,0.1)',
      strokeWidth: 2,
    });

    const text = new fabric.IText(sName, {
      fontSize: 18,
      originX: 'center', originY: 'center',
      left: 36, top: 36,
      fill: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter', fontWeight: '900',
      selectable: false,
    });

    const group = new fabric.Group([seat, text], {
      left: 150, top: 150,
      originX: 'left',
      originY: 'top',
      perPixelTargetFind: true,
      data: { 
        id: crypto.randomUUID(),
        type: 'seat',
        seatNumber: sName, 
        zoneName, 
        zoneColor,
        isDirty: true // Mark as dirty for alignment
      }
    });

    fabricRef.current.add(group);
    fabricRef.current.setActiveObject(group);
  };

  const deleteSelected = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      saveToHistory(); // Save state before deletion
      
      const objectsToDelete = activeObject.type === 'activeSelection' 
          ? activeObject.getObjects() 
          : [activeObject];
      
      const idsToDelete = [];

      objectsToDelete.forEach(obj => {
          const id = obj.data?.id;
          if (id && id.length > 20) {
            idsToDelete.push(id);
          }
      });
      
      setDeletedIds(prev => [...prev, ...idsToDelete]);
      
      canvas.discardActiveObject();
      objectsToDelete.forEach(obj => canvas.remove(obj));
      canvas.requestRenderAll();
      setSelectedSeat(null);
    }
  };

  const autoReorder = () => {
    saveToHistory();
    const objects = fabricRef.current.getObjects();
    const zones = ['A', 'B', 'C'];
    
    let globalCounter = 1;

    zones.forEach(z => {
      // Filter objects by zone and sort by Y then X
      const zoneSeats = objects
        .filter(obj => obj.data?.zoneName === z && obj.data?.type !== 'structure')
        .sort((a, b) => {
          if (Math.abs(a.top - b.top) < 20) return a.left - b.left;
          return a.top - b.top;
        });

      zoneSeats.forEach((seat, index) => {
        const localNum = index + 1;
        const displayNum = `${z}-${localNum.toString().padStart(2, '0')}`;
        
        seat.set('data', { 
          ...seat.data, 
          seatNumber: localNum.toString(),
          displayNumber: displayNum,
          globalNumber: globalCounter++
        });

        const textObj = seat.getObjects().find(obj => obj.type === 'i-text');
        if (textObj) textObj.set('text', displayNum);
      });
    });

    fabricRef.current.renderAll();
  };

  const rotateSelected = () => {
    const activeObject = fabricRef.current.getActiveObject();
    if (activeObject) {
      saveToHistory();
      activeObject.rotate(((activeObject.angle || 0) + 90) % 360);
      fabricRef.current.renderAll();
    }
  };

    // Load Seats Function
    const loadSeats = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('seats').select('*').order('global_number', { ascending: true });
      if (error) {
        console.error('Error loading seats:', error);
      } else if (data && data.length > 0) {
        if (fabricRef.current) fabricRef.current.clear();
        
        // Horizontal centering
        const minX = Math.min(...data.map(s => s.pos_x));
        const maxX = Math.max(...data.map(s => s.pos_x + (s.width || 72)));
        const layoutWidth = maxX - minX;
        const offsetX = (1000 - layoutWidth) / 2 - minX;

        // Vertical dynamic height with 20px padding
        const minY = Math.min(...data.map(s => s.pos_y));
        const maxY = Math.max(...data.map(s => s.pos_y + (s.height || 72)));
        const layoutHeight = maxY - minY;
        const offsetY = 20 - minY;
        const totalHeight = layoutHeight + 40;

        fabricRef.current.setDimensions({ width: 1000, height: totalHeight });

        data.forEach(s => {
          renderSeat({
            ...s,
            pos_x: s.pos_x + offsetX,
            pos_y: s.pos_y + offsetY
          });
          // Ensuring clean state on load
          const obj = fabricRef.current.getObjects().find(o => o.data.id === s.id);
          if (obj) {
             delete obj.data.isDirty;
          }
        });
      }
      setLoading(false);
    };

    // Expose loadSeats to component scope via ref or just define it here? 
    // Since we are inside the component but outside useEffect, we need to be careful with dependencies if we move it up.
    // Actually, simplifying: I will attach it to a ref to be callable, or just trigger a re-mount?
    // Better: Move loadSeats OUT of useEffect entirely, and wrap in useCallback?
    // But loadSeats uses 'fabricRef.current', so it's fine.
    
    // We can't easily move it out without refactoring the whole component structure.
    // Instead, I will duplicate the refresh logic in saveLayout or just set a flag? 
    // No, I'll attach it to the canvas ref for hacky access or just reload the page?
    // Let's go with a cleaner approach: Define loadSeats in the component body (using useCallback) and call it in useEffect.
    
    // HOWEVER, for this tool call, I am editing the block that *contains* saveLayout. 
    // I need to change saveLayout AND make sure it can reload.
    // Since I can't easily move loadSeats from lines 66-103 in this single Replace block (it's too far away), 
    // I will rewrite saveLayout to just reload via window.location.reload() for now as a fallback? 
    // No, that's bad. 
    // I will implement a "reload" trigger state.
    
    // Actually, I can just re-fetch the data in saveLayout same way loadSeats does. It's redundant but safe.
    
    const saveLayout = async () => {
    setLoading(true);

    try {
      // 1. Process Deletions First
      if (deletedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('seats')
            .delete()
            .in('id', deletedIds);
          
          if (deleteError) {
              console.error('Error deleting items:', deleteError);
              throw deleteError;
          }
      }

      // 2. Process Upserts (Updates + Inserts)
      const objects = fabricRef.current.getObjects();
      const existingItems = [];
      const newItems = [];

      objects.forEach(obj => {
        // Calculate true visual dimensions including scale
        const finalWidth = Math.round(obj.getScaledWidth());
        const finalHeight = Math.round(obj.getScaledHeight());
        
        // Ensure seatNumber fallback (same robustness as before)
        const isStructure = obj.data?.type === 'structure';
        const sNum = obj.data?.seatNumber || (isStructure ? `STR_${obj.data.id.slice(-8)}` : '0');

        const payload = {
          zone_id: selectedZoneId, // CRITICAL: Link to selected zone
          pos_x: Math.round(obj.left), 
          pos_y: Math.round(obj.top), 
          rotation: Math.round(obj.angle || 0),
          // Common data
          type: obj.data?.type || 'seat',
          // Structure specific
          width: finalWidth, 
          height: finalHeight,
          label: obj.data?.label || null,
          bg_color: obj.data?.bgColor || null,
          stroke_color: obj.data?.strokeColor || null,
          text_color: obj.data?.textColor || null,
          font_size: obj.data?.fontSize || null,
          // Seat specific
          seat_number: sNum,
          display_number: obj.data?.displayNumber || null,
          zone_name: obj.data?.zoneName || null,
          zone_color: obj.data?.zoneColor || null,
          global_number: obj.data?.globalNumber || null
        };

        if (obj.data?.id && obj.data.id.length > 20) {
          payload.id = obj.data.id;
          existingItems.push(payload);
        } else {
          // Should not happen often now that we init UUIDs, but fallback
          newItems.push(payload);
        }
      });

      // Batch Upsert Existing
      if (existingItems.length > 0) {
        const { error } = await supabase.from('seats').upsert(existingItems);
        if (error) throw error;
      }

      // Batch Insert New
      if (newItems.length > 0) {
        const { error } = await supabase.from('seats').insert(newItems);
        if (error) throw error;
      }

      alert('저장되었습니다.');
      
      // Clear dirty flags & deletedIds
      setDeletedIds([]);
      fabricRef.current.getObjects().forEach(obj => {
        if (obj.data) delete obj.data.isDirty;
      });
      
      // Reload to ensure sync
      window.location.reload();

    } catch (error) {
      console.error('Error saving layout:', error);
      alert('저장 실패: ' + (error.message || error.details || JSON.stringify(error)));
    } finally {
      setLoading(false);
    }
  };

  // Position Auto Alignment Logic: Snap dirty objects to nearest clean anchors
  const alignPositions = () => {
    saveToHistory();
    const objects = fabricRef.current.getObjects();
    const THRESHOLD = 30; // Pixel threshold to consider aligned

    const dirtyObjs = objects.filter(o => o.data?.isDirty);
    const cleanObjs = objects.filter(o => !o.data?.isDirty);

    // Extract anchor coordinates
    const anchorXs = cleanObjs.map(o => Math.round(o.left));
    const anchorYs = cleanObjs.map(o => Math.round(o.top));

    dirtyObjs.forEach(obj => {
      let currentX = obj.left;
      let currentY = obj.top;

      // 1. Align Vertically (Snap X to nearest Anchor Column)
      let bestX = currentX;
      let minDistX = Infinity;
      
      anchorXs.forEach(ax => {
        const dist = Math.abs(currentX - ax);
        if (dist < THRESHOLD && dist < minDistX) {
          minDistX = dist;
          bestX = ax;
        }
      });
      
      if (minDistX < THRESHOLD) {
        obj.set('left', bestX);
      }

      // 2. Align Horizontally (Snap Y to nearest Anchor Row)
      let bestY = currentY;
      let minDistY = Infinity;
      
      anchorYs.forEach(ay => {
        const dist = Math.abs(currentY - ay);
        if (dist < THRESHOLD && dist < minDistY) {
          minDistY = dist;
          bestY = ay;
        }
      });
      
      if (minDistY < THRESHOLD) {
        obj.set('top', bestY);
      }
      
      obj.setCoords();
    });

    fabricRef.current.renderAll();
  };

  return (
    <div className="flex flex-col w-full h-full mx-auto leading-normal overflow-hidden relative bg-[#F2F2F7]">
      {loading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-3 border-ios-indigo border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      {/* Top Unified Toolbar */}
      <div className="bg-white/80 backdrop-blur-md border-b border-black/5 p-4 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-4">
          {/* Zone Selection Buttons */}
          <div className="flex gap-1">
            {zones.map(z => (
              <button
                key={z.id}
                onClick={() => setSelectedZoneId(z.id)}
                className={`px-5 py-2 rounded-apple-md text-[11px] font-black transition-all border ${
                  selectedZoneId === z.id 
                    ? 'bg-[#1C1C1E] text-white border-[#1C1C1E] shadow-sm' 
                    : 'bg-white text-ios-gray border-gray-100 hover:text-[#1C1C1E] hover:border-gray-200'
                }`}
              >
                {z.name}
              </button>
            ))}
          </div>

          <div className="h-6 w-[1px] bg-gray-200 mx-2" />

          {/* Action Tools */}
          <div className="flex items-center gap-1.5">
            <button 
              onClick={addSeat} 
              className="flex items-center gap-2 bg-ios-indigo text-white px-4 py-2 rounded-apple-md text-[11px] font-black hover:bg-ios-indigo/90 transition-all ios-tap shadow-sm shadow-ios-indigo/20"
            >
              <Plus className="w-3.5 h-3.5" />
              좌석 추가
            </button>
            <button 
              onClick={() => setCreationMode(prev => prev === 'structure' ? null : 'structure')} 
              className={`flex items-center gap-2 px-4 py-2 rounded-apple-md text-[11px] font-black transition-all border ios-tap ${
                creationMode === 'structure' 
                  ? 'bg-[#1C1C1E] text-white border-[#1C1C1E]' 
                  : 'bg-white text-ios-gray border-gray-100 hover:bg-gray-50'
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              공간요소 추가
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={autoReorder}
            className="p-2.5 rounded-apple-md bg-white border border-gray-100 text-ios-amber hover:bg-ios-amber/5 transition-all ios-tap group"
            title="번호 자동 정렬"
          >
            <Hash className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
          <button 
            onClick={alignPositions}
            className="p-2.5 rounded-apple-md bg-white border border-gray-100 text-ios-emerald hover:bg-ios-emerald/5 transition-all ios-tap group"
            title="위치 정렬"
          >
            <Grid className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
          
          <div className="h-6 w-[1px] bg-gray-200 mx-2" />
          
          <button 
            onClick={saveLayout} 
            disabled={loading}
            className="flex items-center gap-2 bg-[#1C1C1E] text-white px-5 py-2.5 rounded-apple-md text-[12px] font-black hover:bg-black transition-all ios-tap disabled:opacity-50 shadow-lg shadow-black/5"
          >
            <Save className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            레이아웃 저장
          </button>
        </div>
      </div>

      <div className="flex-1 w-full relative overflow-hidden bg-white">
        {/* Creation Mode Indicator Overlay */}
        {creationMode === 'structure' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#1C1C1E]/80 backdrop-blur-lg px-6 py-2.5 rounded-full border border-white/10 shadow-xl pointer-events-none animate-spring-up">
            <span className="text-white text-[11px] font-black tracking-tight">드래그하여 공간요소 영역을 지정하세요</span>
          </div>
        )}

        {/* Canvas Host */}
        <div className="w-full h-full flex flex-col">
          <div 
            ref={containerRef} 
            className="flex-1 h-full relative overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none scrollbar-hide"
          />
        </div>

        {/* Floating Inspector (Context Sensitive) */}
        <div className={`absolute top-6 right-6 w-72 transition-all duration-500 ease-apple-out z-40 ${
          selectedSeat ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}>
          <div className="glass-material rounded-apple-xl border border-white/40 shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-ios-indigo">속성 설정</h3>
              <div className="flex gap-1.5">
                <button 
                  onClick={rotateSelected} 
                  className="p-2 rounded-apple-md bg-white/50 hover:bg-white text-ios-indigo transition-all shadow-sm border border-white/40"
                  title="90도 회전"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={deleteSelected} 
                  className="p-2 rounded-apple-md bg-ios-rose/5 hover:bg-ios-rose text-ios-rose hover:text-white transition-all shadow-sm border border-ios-rose/10"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            {selectedSeat?.data?.type !== 'structure' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1">Display No</label>
                    <input 
                      type="text"
                      value={displayNumber}
                      onChange={(e) => setDisplayNumber(e.target.value)}
                      className="w-full bg-white/80 border border-white/60 rounded-[8px] p-2.5 text-xs font-black text-[#1C1C1E] focus:ring-1 focus:ring-ios-indigo"
                      placeholder="예: A-01"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1">Zone</label>
                    <select 
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value)}
                      className="w-full bg-white/80 border border-white/60 rounded-[8px] p-2.5 text-xs font-black text-[#1C1C1E] focus:ring-1 focus:ring-ios-indigo appearance-none"
                    >
                      <option value="A">Zone A</option>
                      <option value="B">Zone B</option>
                      <option value="C">Zone C</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1 flex items-center gap-1.5">
                    <Palette className="w-2.5 h-2.5" /> Zone Color
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      value={zoneColor}
                      onChange={(e) => setZoneColor(e.target.value)}
                      className="w-10 h-10 bg-transparent border-0 rounded-[8px] cursor-pointer overflow-hidden p-0 shadow-sm"
                    />
                    <input 
                      type="text" 
                      value={zoneColor.toUpperCase()}
                      onChange={(e) => setZoneColor(e.target.value)}
                      className="flex-1 bg-white/80 border border-white/60 rounded-[8px] p-2.5 text-[10px] font-black text-[#1C1C1E]"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={updateSeatProperties}
                    className="w-full bg-ios-indigo text-white py-3 rounded-apple-md font-black text-[11px] shadow-lg shadow-ios-indigo/20 ios-tap"
                  >
                    변경 적용
                  </button>
                  <button 
                    onClick={() => setSelectedSeat(null)}
                    className="w-full mt-2 text-ios-gray py-2 font-bold text-[10px] hover:text-[#1C1C1E] transition-colors"
                  >
                    속성창 닫기
                  </button>
                </div>
              </div>
            ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1 flex items-center gap-1.5">
                      배경색
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="w-10 h-10 bg-transparent border-0 rounded-[8px] cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={bgColor.toUpperCase()}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="flex-1 bg-white/80 border border-white/60 rounded-[8px] p-2.5 text-[10px] font-black"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1">테두리색</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={strokeColor}
                        onChange={(e) => setStrokeColor(e.target.value)}
                        className="w-10 h-10 bg-transparent border-0 rounded-[8px] cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={strokeColor.toUpperCase()}
                        onChange={(e) => setStrokeColor(e.target.value)}
                        className="flex-1 bg-white/80 border border-white/60 rounded-[8px] p-2.5 text-[10px] font-black"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1">글자색</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-10 h-10 bg-transparent border-0 rounded-[8px] cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={textColor.toUpperCase()}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="flex-1 bg-white/80 border border-white/60 rounded-[8px] p-2.5 text-[10px] font-black"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest px-1">글자 크기 ({fontSize}px)</label>
                    <input 
                      type="range"
                      min="6"
                      max="48"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={updateSeatProperties}
                      className="w-full bg-ios-indigo text-white py-3 rounded-apple-md font-black text-[11px] shadow-lg"
                    >
                      스타일 적용
                    </button>
                    <button 
                      onClick={() => setSelectedSeat(null)}
                      className="w-full mt-2 text-ios-gray py-2 font-bold text-[10px]"
                    >
                      닫기
                    </button>
                  </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloorPlanEditor;

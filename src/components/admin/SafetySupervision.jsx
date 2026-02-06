import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Printer, Plus, X, PenTool, Trash2, Check, Edit2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isWithinInterval, parseISO, isPast, isToday, eachMonthOfInterval, setDate, getDate, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';

const SignaturePad = ({ onSave, onCancel }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Handle high DPI
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        // Set properties AFTER resizing as resizing resets context state
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
    }, []);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        setIsDrawing(true);
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        
        // Ensure properties are set on every new path
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
        setHasDrawn(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
    };

    const handleSave = () => {
        if (!hasDrawn) {
            alert('서명을 입력해 주세요.');
            return;
        }
        const canvas = canvasRef.current;
        canvas.toBlob((blob) => {
            onSave(blob);
        }, 'image/png');
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onCancel}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-spring-up" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h4 className="text-sm font-black text-[#1C1C1E] flex items-center gap-2">
                        <PenTool className="w-4 h-4 text-ios-indigo" /> 전자 서명
                    </h4>
                    <button onClick={onCancel} className="p-1 rounded-full hover:bg-gray-200 text-ios-gray">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 bg-white flex flex-col items-center gap-4">
                    <p className="text-xs text-ios-gray mb-2">아래 영역에 정자로 서명해 주세요.</p>
                    <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 touch-none overflow-hidden relative w-full h-[200px]">
                        <canvas
                            ref={canvasRef}
                            style={{ width: '100%', height: '100%' }}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-3 bg-gray-50">
                    <button 
                        onClick={clear}
                        className="flex-1 py-3 bg-white border border-gray-200 text-[#1C1C1E] rounded-xl text-xs font-bold hover:bg-gray-50 transition-all"
                    >
                        초기화
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex-[2] py-3 bg-[#1C1C1E] text-white rounded-xl text-xs font-bold hover:bg-gray-800 shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        <Check className="w-4 h-4" /> 서명 완료
                    </button>
                </div>
            </div>
        </div>
    );
};

const SafetySupervision = () => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [assignments, setAssignments] = useState([]);
    const [zones, setZones] = useState([]);
    const [selectedZoneId, setSelectedZoneId] = useState(null);
    const [loading, setLoading] = useState(false);
    
    const [currentUser, setCurrentUser] = useState(null);
    const [quarters, setQuarters] = useState([]);
    const [operatingRules, setOperatingRules] = useState([]);
    const [exceptions, setExceptions] = useState([]);
    const [schoolInfo, setSchoolInfo] = useState({ name: '', level: '' });
    
    // Derived academic year from currentMonth (Korean school standard: ends in February)
    const monthVal = currentMonth.getMonth() + 1;
    const academicYear = monthVal < 3 ? currentMonth.getFullYear() - 1 : currentMonth.getFullYear();

    const [addModal, setAddModal] = useState(null);
    const [editModal, setEditModal] = useState(null);
    const [signModal, setSignModal] = useState(null);
    const [printModal, setPrintModal] = useState(false);
    const [printData, setPrintData] = useState(null);
    const [manualName, setManualName] = useState('');
    const [showWeekends, setShowWeekends] = useState(false);

    useEffect(() => {
        fetchUser();
        fetchZones();
        fetchSchoolInfo();
    }, []);

    useEffect(() => {
        if (selectedZoneId) {
            fetchInitialData();
        }
    }, [academicYear, selectedZoneId]);

    useEffect(() => {
        if (selectedZoneId) {
            fetchAssignments();
        }
    }, [currentMonth, selectedZoneId]);

    const fetchSchoolInfo = async () => {
        const { data } = await supabase.from('configs').select('value').eq('key', 'school_info').single();
        if (data?.value) {
            setSchoolInfo(data.value);
        }
    };

    const fetchZones = async () => {
        const { data: zoneData } = await supabase.from('zones').select('*').eq('is_active', true).order('created_at', { ascending: true });
        if (zoneData && zoneData.length > 0) {
            setZones(zoneData);
            setSelectedZoneId(zoneData[0].id);
        }
    };

    const fetchInitialData = async () => {
        const [q, e, sData] = await Promise.all([
            supabase.from('operation_quarters').select('*').eq('academic_year', academicYear).order('quarter', { ascending: true }),
            supabase.from('operation_exceptions').select('*'),
            supabase.from('sessions').select('*').eq('zone_id', selectedZoneId).order('start_time', { ascending: true })
        ]);
        if (q.data) setQuarters(q.data);
        if (e.data) setExceptions(e.data);
        
        // Fetch operating rules from session_operating_days
        const { data: rulesData } = await supabase
            .from('session_operating_days')
            .select('session_id, day_of_week')
            .in('session_id', (sData.data || []).map(s => s.id))
            .eq('is_active', true);
            
        setOperatingRules(rulesData || []);
    };


    const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            setCurrentUser({ ...user, profile });
        }
    };

    const fetchAssignments = async () => {
        if (!selectedZoneId) return;
        setLoading(true);
        const start = startOfMonth(currentMonth).toISOString();
        const end = endOfMonth(currentMonth).toISOString();
        
        const { data, error } = await supabase
            .from('supervision_assignments')
            .select('*')
            .eq('zone_id', selectedZoneId)
            .gte('date', start)
            .lte('date', end)
            .order('created_at', { ascending: true });
        
        if (data) setAssignments(data);
        setLoading(false);
    };

    const handleAddSupervisor = async () => {
        if (!manualName.trim() || !addModal || !selectedZoneId) return;
        
        const dateStr = format(addModal.date, 'yyyy-MM-dd');
        
        const { error } = await supabase
            .from('supervision_assignments')
            .insert([{
                date: dateStr,
                supervisor_name: manualName.trim(),
                teacher_id: null,
                zone_id: selectedZoneId
            }]);

        if (error) {
            alert('배정 추가 실패: ' + error.message);
        } else {
            setManualName('');
            setAddModal(null);
            fetchAssignments();
        }
    };

    const handleUpdateSupervisor = async () => {
        if (!manualName.trim() || !editModal) return;

        const { error } = await supabase
            .from('supervision_assignments')
            .update({ supervisor_name: manualName.trim() })
            .eq('id', editModal.id);

        if (error) {
            alert('수정 실패: ' + error.message);
        } else {
            setManualName('');
            setEditModal(null);
            fetchAssignments();
        }
    };

    const getFileNameFromUrl = (url) => {
        if (!url) return null;
        const parts = url.split('/signatures/');
        return parts.length > 1 ? parts[1] : null;
    };

    const handleDeleteAssignment = async (id, e) => {
        e.stopPropagation();
        if (!confirm('정말 삭제하시겠습니까? 서명도 함께 삭제됩니다.')) return;

        const targetAssignment = assignments.find(a => a.id === id);
        if (targetAssignment?.signature_url) {
            const fileName = getFileNameFromUrl(targetAssignment.signature_url);
            if (fileName) {
                await supabase.storage.from('signatures').remove([fileName]);
            }
        }
        
        const { error } = await supabase
            .from('supervision_assignments')
            .delete()
            .eq('id', id);
             
        if (!error) fetchAssignments();
    };

    const handleSignatureUpload = async (blob) => {
        if (!signModal) return;

        const targetAssignment = assignments.find(a => a.id === signModal.assignmentId);
        if (targetAssignment?.signature_url) {
             const oldFileName = getFileNameFromUrl(targetAssignment.signature_url);
             if (oldFileName) {
                 await supabase.storage.from('signatures').remove([oldFileName]);
             }
        }

        const fileName = `sig_${signModal.assignmentId}_${Date.now()}.png`;
        const { data, error: uploadError } = await supabase.storage
            .from('signatures')
            .upload(fileName, blob, { contentType: 'image/png', upsert: true });

        if (uploadError) {
            alert('서명 업로드 실패: ' + uploadError.message);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('signatures').getPublicUrl(fileName);

        const { error: dbError } = await supabase
            .from('supervision_assignments')
            .update({ signature_url: publicUrl })
            .eq('id', signModal.assignmentId);

        if (dbError) {
            alert('서명 저장 실패: ' + dbError.message);
        } else {
            setSignModal(null);
            fetchAssignments();
        }
    };

    const handlePrintClick = () => {
        setPrintModal(true);
    };

    const handlePrintConfirm = async (quarter) => {
        if (!selectedZoneId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('supervision_assignments')
            .select('*')
            .eq('zone_id', selectedZoneId)
            .gte('date', quarter.start_date)
            .lte('date', quarter.end_date)
            .order('date', { ascending: true });

        if (error) {
            alert('데이터 로드 실패: ' + error.message);
            setLoading(false);
            return;
        }

        setPrintData({ quarter, assignments: data || [], operatingRules, exceptions });
        setPrintModal(false);
        setLoading(false);

        setTimeout(() => {
            window.print();
        }, 500);
    };

    const renderHeader = () => (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                    <h3 className="text-2xl font-black text-[#1C1C1E] tracking-tight">
                        {format(currentMonth, 'yyyy년 M월')}
                    </h3>
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg text-ios-gray hover:text-[#1C1C1E] transition-all ios-tap shadow-sm hover:shadow">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg text-ios-gray hover:text-[#1C1C1E] transition-all ios-tap shadow-sm hover:shadow">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Zone Selection */}
                <div className="flex items-center gap-2">
                    {zones.map(z => (
                        <button
                            key={z.id}
                            onClick={() => setSelectedZoneId(z.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ios-tap ${
                                selectedZoneId === z.id ? 'bg-[#1C1C1E] text-white shadow-md' : 'text-ios-gray hover:text-[#1C1C1E]'
                            }`}
                        >
                            {z.name}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer group select-none">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showWeekends ? 'bg-[#1C1C1E] border-[#1C1C1E]' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                        {showWeekends && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <input 
                        type="checkbox" 
                        checked={showWeekends} 
                        onChange={(e) => setShowWeekends(e.target.checked)} 
                        className="hidden" 
                    />
                    <span className="text-xs font-bold text-ios-gray group-hover:text-[#1C1C1E] transition-colors">주말 포함</span>
                </label>
                <button 
                    onClick={handlePrintClick}
                    className="flex items-center gap-2 bg-[#1C1C1E] text-white px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-lg hover:bg-gray-800 hover:shadow-xl ios-tap"
                >
                    <Printer className="w-3.5 h-3.5" /> 대장 출력
                </button>
            </div>
        </div>
    );

    const renderDays = () => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const visibleDays = showWeekends ? days : days.filter((_, i) => i !== 0 && i !== 6);
        
        return (
            <div className={`grid ${showWeekends ? 'grid-cols-7' : 'grid-cols-5'} mb-2 border-b border-gray-100`}>
                {visibleDays.map((day, i) => (
                    <div key={i} className={`py-3 text-[10px] font-black uppercase text-center tracking-widest ${
                        (showWeekends && i === 0) ? 'text-ios-rose' : 
                        (showWeekends && i === 6) ? 'text-ios-indigo' : 'text-ios-gray'
                    }`}>
                        {day}
                    </div>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);
        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <div className={`grid ${showWeekends ? 'grid-cols-7' : 'grid-cols-5'} gap-px bg-gray-100 border border-gray-100 rounded-[12px] overflow-hidden shadow-sm`}>
                {calendarDays.filter(date => showWeekends || (date.getDay() !== 0 && date.getDay() !== 6)).map((date, i) => {
                    const isTodayLocal = isToday(date);
                    const isSameMonthCell = isSameMonth(date, monthStart);
                    const dayOfWeek = date.getDay();
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const dayAssignments = assignments.filter(a => a.date === dateStr);
                    
                    const exception = exceptions.find(e => e.exception_date === dateStr);
                    const quarter = quarters.find(q => 
                        q.start_date && q.end_date && 
                        isWithinInterval(date, { 
                            start: parseISO(q.start_date), 
                            end: parseISO(q.end_date) 
                        })
                    );

                    const dayOperatingRules = operatingRules.filter(r => r.day_of_week === dayOfWeek);
                    const isOperatingDay = quarter && !exception && (dayOperatingRules.length > 0);
                    // Determine if short day (no period 1 or period 2)
                    // We need session metadata for this, but as a heuristic:
                    const isShortDay = dayOperatingRules.length <= 2;

                    const maxSlots = isOperatingDay ? (isShortDay ? 1 : 2) : 0;

                    const isAdmin = currentUser?.profile?.role === 'admin';
                    const canSign = isAdmin || isTodayLocal;

                    return (
                        <div key={i} className={`h-[200px] p-2 flex flex-col gap-2 transition-colors border-b border-r border-gray-100 ${
                            !isSameMonthCell ? 'bg-gray-50/50 opacity-40' : 
                            !isOperatingDay ? 'bg-gray-50' : 'bg-white'
                        }`}>
                            <div className="flex justify-between items-start">
                                <span className={`text-[12px] font-black ${
                                    isTodayLocal ? 'w-6 h-6 text-ios-indigo border-2 border-ios-indigo rounded-full flex items-center justify-center -mt-1 -ml-1 bg-white' : 
                                    dayOfWeek === 0 ? 'text-ios-rose' : 
                                    dayOfWeek === 6 ? 'text-ios-indigo' : 'text-[#1C1C1E]'
                                }`}>
                                    {format(date, 'd')}
                                </span>
                                {(isAdmin && isOperatingDay && dayAssignments.length < maxSlots) && (
                                    <button 
                                        onClick={() => setAddModal({ date })}
                                        className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1C1C1E] text-white hover:bg-gray-800 transition-all ios-tap shadow-sm"
                                        title="감독관 추가"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto scrollbar-hide">
                                {dayAssignments.map((assign) => (
                                    <div key={assign.id} className="relative group bg-gray-50 rounded-[8px] p-2 border border-dashed border-gray-200 hover:border-ios-indigo/30 transition-all">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[11px] font-bold text-[#1C1C1E]">{assign.supervisor_name}</span>
                                            {isAdmin && (
                                                <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setManualName(assign.supervisor_name);
                                                            setEditModal({ id: assign.id, name: assign.supervisor_name, date: date });
                                                        }}
                                                        className="p-1 text-gray-400 hover:text-ios-indigo transition-colors"
                                                        title="이름 수정"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDeleteAssignment(assign.id, e)}
                                                        className="p-1 text-gray-400 hover:text-ios-rose transition-colors"
                                                        title="삭제"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {assign.signature_url ? (
                                            <div className="relative h-8 flex items-center">
                                                <img src={assign.signature_url} alt="서명" className="h-full object-contain opacity-80" />
                                                {(isAdmin) && (
                                                     <button 
                                                        onClick={() => setSignModal({ assignmentId: assign.id })}
                                                        className="absolute inset-0 bg-black/5 opacity-0 hover:opacity-100 flex items-center justify-center text-[9px] text-[#1C1C1E] font-black rounded backdrop-blur-[1px]"
                                                     >
                                                        재서명
                                                     </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="h-8 flex items-center justify-center">
                                                {(isAdmin || (currentUser?.profile?.full_name === assign.supervisor_name && canSign)) ? (
                                                    <button 
                                                        onClick={() => setSignModal({ assignmentId: assign.id })}
                                                        className="w-full h-full border border-dashed border-ios-indigo/30 rounded flex items-center justify-center gap-1 text-[9px] text-ios-indigo font-bold hover:bg-ios-indigo/5 transition-colors"
                                                    >
                                                        <PenTool className="w-3 h-3" /> 서명하기
                                                    </button>
                                                ) : (
                                                    (!isTodayLocal && isPast(date)) ? (
                                                        <span className="text-[9px] text-red-500 font-bold">불참</span>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-300 font-medium">서명 대기</span>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col p-6 animate-spring-up overflow-hidden relative print:hidden">
            <div className="flex-none">
                {renderHeader()}
                {renderDays()}
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-hide -mr-2 pr-2">
                {renderCells()}
            </div>

            {addModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setAddModal(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden animate-spring-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h4 className="text-sm font-black text-[#1C1C1E]">
                                {format(addModal.date, 'M월 d일')} 감독관 추가
                            </h4>
                            <button onClick={() => setAddModal(null)} className="p-1 rounded-full hover:bg-gray-200 text-ios-gray">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-ios-gray uppercase tracking-wider mb-2">이름 직접 입력</label>
                                <input 
                                    type="text" 
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                    placeholder="선생님 성함"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-ios-indigo/50 transition-all"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSupervisor()}
                                    autoFocus
                                />
                            </div>
                            <button 
                                onClick={handleAddSupervisor}
                                className="w-full py-3 bg-[#1C1C1E] text-white rounded-xl text-xs font-bold hover:bg-gray-800 shadow-lg transition-all"
                            >
                                추가하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setEditModal(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden animate-spring-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h4 className="text-sm font-black text-[#1C1C1E]">
                                감독관 이름 수정
                            </h4>
                            <button onClick={() => setEditModal(null)} className="p-1 rounded-full hover:bg-gray-200 text-ios-gray">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-ios-gray uppercase tracking-wider mb-2">이름 수정</label>
                                <input 
                                    type="text" 
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                    placeholder="선생님 성함"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-ios-indigo/50 transition-all"
                                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateSupervisor()}
                                    autoFocus
                                />
                            </div>
                            <button 
                                onClick={handleUpdateSupervisor}
                                className="w-full py-3 bg-[#1C1C1E] text-white rounded-xl text-xs font-bold hover:bg-gray-800 shadow-lg transition-all"
                            >
                                수정 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {signModal && (
                <SignaturePad 
                    onSave={handleSignatureUpload}
                    onCancel={() => setSignModal(null)}
                />
            )}

            {printModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setPrintModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-spring-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h4 className="text-sm font-black text-[#1C1C1E] flex items-center gap-2">
                                <Printer className="w-4 h-4 text-ios-indigo" /> 대장 출력
                            </h4>
                            <button onClick={() => setPrintModal(false)} className="p-1 rounded-full hover:bg-gray-200 text-ios-gray">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            <p className="text-xs text-ios-gray mb-4">출력할 학기/분기를 선택해 주세요.</p>
                            <div className="grid gap-2">
                                {quarters.map(q => (
                                    <button
                                        key={q.id}
                                        onClick={() => handlePrintConfirm(q)}
                                        className="w-full p-3 rounded-xl border border-gray-100 hover:border-ios-indigo/50 hover:bg-ios-indigo/5 transition-all text-left group"
                                    >
                                        <span className="text-sm font-bold text-[#1C1C1E] group-hover:text-ios-indigo">
                                            {q.quarter_name ? `${q.quarter_name}: ` : ''}{q.start_date} ~ {q.end_date}
                                        </span>
                                    </button>
                                ))}
                                {quarters.length === 0 && (
                                    <div className="text-center py-6 text-gray-300 text-xs">
                                        등록된 분기 정보가 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {printData && createPortal(
                <div id="print-root" className="bg-white text-black hidden print:block">
                    <style>
                        {`
                            @media print {
                                @page { size: A4 portrait; margin: 0; }
                                body { 
                                    margin: 0 !important;
                                    padding: 0 !important;
                                    background-color: white !important;
                                    font-family: 'Malgun Gothic', 'Dotum', 'Apple SD Gothic Neo', sans-serif !important;
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                    color: #000000 !important;
                                }
                                body > #root {
                                    display: none !important;
                                }
                                body > #print-root {
                                    display: block !important;
                                    width: 210mm !important;
                                    min-height: 297mm !important;
                                    padding: 10mm !important;
                                    box-sizing: border-box !important;
                                    background-color: white !important;
                                    font-family: 'Malgun Gothic', 'Dotum', 'Apple SD Gothic Neo', sans-serif !important;
                                }
                                /* Force solid borders */
                                * {
                                    border-color: #000000 !important;
                                    border-style: solid !important;
                                }
                                /* Ensure text is strictly black */
                                .print-text-black {
                                    color: #000000 !important;
                                }
                            }
                            #print-root {
                                display: none;
                            }
                        `}
                    </style>
                    
                    <div className="flex flex-col w-full h-full bg-white relative">
                        <div className="flex-none mb-2 text-center">
                            <h1 className="text-[20pt] font-black tracking-widest mb-1 underline decoration-2 underline-offset-4 text-black">
                                 청람재 감독 명부
                            </h1>
                            <div className="flex justify-between items-end border-b-2 border-black pb-1 mb-1 relative">
                                <span className="text-[9pt] font-bold text-black absolute left-0 bottom-1">
                                    {printData.quarter.quarter_name} ({printData.quarter.start_date} ~ {printData.quarter.end_date})
                                </span>
                                <span className="w-full text-center text-[8pt] text-transparent">.</span>
                                <span className="text-[8pt] text-black absolute right-0 bottom-1">
                                     출력일: {format(new Date(), 'yyyy. MM. dd.')}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 flex gap-2 items-start justify-center w-full">
                            {(() => {
                                try {
                                    const start = parseISO(printData.quarter.start_date);
                                    const end = parseISO(printData.quarter.end_date);
                                    
                                    if (!isValid(start) || !isValid(end)) {
                                        return <div className="w-full text-center p-10 text-red-500 font-bold">날짜 범위가 올바르지 않습니다.</div>;
                                    }

                                    return eachMonthOfInterval({ start, end }).map((monthDate, mIndex) => {
                                        const days = Array.from({ length: 31 }, (_, i) => {
                                            const dayNum = i + 1;
                                            try {
                                                const targetDate = setDate(monthDate, dayNum);
                                                if (!isValid(targetDate) || !isSameMonth(targetDate, monthDate)) {
                                                    return null; 
                                                }
                                                return targetDate;
                                            } catch { return null; }
                                        });

                                        return (
                                            <div key={mIndex} className="flex-1 h-full flex flex-col min-w-0">
                                                <table className="w-full border-collapse table-fixed border border-black">
                                                    <colgroup>
                                                        <col style={{ width: '12%' }} />
                                                        <col style={{ width: '22%' }} />
                                                        <col style={{ width: '22%' }} />
                                                        <col style={{ width: '22%' }} />
                                                        <col style={{ width: '22%' }} />
                                                    </colgroup>
                                                    <thead>
                                                        <tr className="bg-[#E5E7EB]">
                                                            <th colSpan={5} className="border border-black text-center font-bold py-1 text-[10pt] text-black">
                                                                {format(monthDate, 'M월')}
                                                            </th>
                                                        </tr>
                                                        <tr className="bg-[#F3F4F6] text-[7pt] text-black font-bold h-[8mm]">
                                                            <th rowSpan={2} className="border border-black text-center align-middle">일자</th>
                                                            <th colSpan={2} className="border border-black text-center align-middle h-[4mm]">감독 1</th>
                                                            <th colSpan={2} className="border border-black text-center align-middle h-[4mm]">감독 2</th>
                                                        </tr>
                                                        <tr className="bg-[#F3F4F6] text-[7pt] text-black font-bold h-[4mm]">
                                                            <th className="border border-black text-center align-middle">성명</th>
                                                            <th className="border border-black text-center align-middle">서명</th>
                                                            <th className="border border-black text-center align-middle">성명</th>
                                                            <th className="border border-black text-center align-middle">서명</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {days.map((date, dIndex) => {
                                                            if (!date) { 
                                                                return (
                                                                    <tr key={dIndex} className="h-[7mm] bg-gray-100/30">
                                                                        <td className="border border-black"></td>
                                                                        <td className="border border-black"></td>
                                                                        <td className="border border-black"></td>
                                                                        <td className="border border-black"></td>
                                                                        <td className="border border-black"></td>
                                                                    </tr>
                                                                );
                                                            }

                                                            const dateStr = format(date, 'yyyy-MM-dd');
                                                            const dayStr = format(date, 'E', { locale: ko });
                                                            const dayAssignments = printData.assignments.filter(a => a.date === dateStr);
                                                            const sup1 = dayAssignments[0];
                                                            const sup2 = dayAssignments[1];

                                                            const exception = printData.exceptions.find(e => e.exception_date === dateStr);
                                                            const isWithinRange = isWithinInterval(date, { 
                                                                start: parseISO(printData.quarter.start_date), 
                                                                end: parseISO(printData.quarter.end_date) 
                                                            });
                                                            const isOperatingDay = isWithinRange && !exception && printData.operatingRules.some(r => r.day_of_week === date.getDay());

                                                            return (
                                                                <tr key={dIndex} className="h-[7mm] text-[7pt] text-black">
                                                                    <td className={`border border-black text-center font-bold tracking-tighter align-middle p-0 ${
                                                                        dayStr === '토' ? 'text-blue-700' : 
                                                                        dayStr === '일' ? 'text-red-600' : 'text-black'
                                                                    }`}>
                                                                        {format(date, 'd')}({dayStr})
                                                                    </td>
                                                                    <td className="border border-black text-center break-all align-middle p-0.5">
                                                                        {isOperatingDay ? (sup1?.supervisor_name || '') : '-'}
                                                                    </td>
                                                                    <td className="border border-black text-center align-middle p-0.5">
                                                                        {isOperatingDay && sup1?.signature_url && <img src={sup1.signature_url} className="max-h-[18px] w-auto mx-auto object-contain" alt="서명" />}
                                                                    </td>
                                                                    <td className="border border-black text-center break-all align-middle p-0.5">
                                                                        {isOperatingDay ? (sup2?.supervisor_name || '') : ''}
                                                                    </td>
                                                                    <td className="border border-black text-center align-middle p-0.5">
                                                                        {isOperatingDay && sup2?.signature_url && <img src={sup2.signature_url} className="max-h-[18px] w-auto mx-auto object-contain" alt="서명" />}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    });
                                } catch (e) {
                                    return <div className="w-full text-center text-red-500">렌더링 오류 발생</div>;
                                }
                            })()}
                        </div>
                        
                        <div className="mt-2 text-center text-[9pt] font-bold flex-none text-black">
                             위와 같이 안전관리 지도 감독을 실시하였음을 확인합니다. &nbsp;&nbsp;&nbsp;&nbsp; {schoolInfo.name ? `${schoolInfo.name}${schoolInfo.level || ''}` : 'GOE학교'}장
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default SafetySupervision;

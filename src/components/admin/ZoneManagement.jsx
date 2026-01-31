import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Save, Layout, Box, Plus, Edit, Trash2, 
  Clock, PlusCircle, CheckCircle2, ChevronRight,
  AlertCircle, Check
} from 'lucide-react';

const ZoneManagement = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    
    // Zone & Session States
    const [zones, setZones] = useState([]);
    const [selectedZoneId, setSelectedZoneId] = useState(null);
    const [sessions, setSessions] = useState([]);

    useEffect(() => {
        fetchZones();
    }, []);

    useEffect(() => {
        if (selectedZoneId) {
            fetchZoneSessions(selectedZoneId);
        }
    }, [selectedZoneId]);

    const fetchZones = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('zones')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            setZones(data || []);
            if (data && data.length > 0) {
                setSelectedZoneId(data[0].id);
            }
        } catch (err) {
            console.error('Error fetching zones:', err);
            setError('공간 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const fetchZoneSessions = async (zoneId) => {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select('*')
                .eq('zone_id', zoneId)
                .order('start_time', { ascending: true });
            
            if (error) throw error;
            setSessions(data || []);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setError('세션 정보를 불러오는 중 오류가 발생했습니다.');
        }
    };

    // --- Zone Actions ---
    const addZone = async () => {
        const name = prompt('새 학습 공간의 이름을 입력하세요 (예: 제2학습실):');
        if (!name) return;

        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('zones')
                .insert([{ 
                    name, 
                    settings: { points: [{ lat: 37.5665, lng: 126.9780, name: '기본 지점' }], radius: 100 } 
                }])
                .select()
                .single();
            
            if (error) throw error;
            setZones([...zones, data]);
            setSelectedZoneId(data.id);
        } catch (err) {
            alert('공간 추가 실패: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const renameZone = async (id, currentName) => {
        const name = prompt('학습 공간의 이름을 수정하세요:', currentName);
        if (!name || name === currentName) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('zones')
                .update({ name })
                .eq('id', id);
            
            if (error) throw error;
            setZones(zones.map(z => z.id === id ? { ...z, name } : z));
        } catch (err) {
            alert('이름 수정 실패: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const deleteZone = async (id) => {
        if (!confirm('정말 이 공간을 삭제하시겠습니까? 관련 세션 및 좌석 데이터가 모두 삭제됩니다!')) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('zones')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            const updated = zones.filter(z => z.id !== id);
            setZones(updated);
            if (updated.length > 0) setSelectedZoneId(updated[0].id);
            else setSelectedZoneId(null);
        } catch (err) {
            alert('공간 삭제 실패: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // --- Session Actions ---
    const addSession = async () => {
        if (!selectedZoneId) return;
        const name = prompt('세션 이름을 입력하세요 (예: 3차시):');
        if (!name) return;

        try {
            const { data, error } = await supabase
                .from('sessions')
                .insert([{ 
                    zone_id: selectedZoneId, 
                    name, 
                    start_time: '09:00:00', 
                    end_time: '12:00:00' 
                }])
                .select()
                .single();
            
            if (error) throw error;
            setSessions([...sessions, data]);
        } catch (err) {
            alert('세션 추가 실패');
        }
    };

    const deleteSession = async (id) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const { error } = await supabase.from('sessions').delete().eq('id', id);
        if (error) alert('삭제 실패');
        else setSessions(sessions.filter(s => s.id !== id));
    };

    const updateSessionField = (id, field, value) => {
        setSessions(sessions.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const handleSave = async () => {
        if (!selectedZoneId) return;
        setSaving(true);
        setSuccess(false);

        try {
            if (sessions.length > 0) {
                const { error } = await supabase.from('sessions').upsert(
                    sessions.map(s => ({
                        id: s.id,
                        zone_id: selectedZoneId,
                        name: s.name,
                        start_time: s.start_time,
                        end_time: s.end_time
                    }))
                );
                if (error) throw error;
            }
            setSuccess(true);
            setTimeout(() => setSuccess(false), 2000);
        } catch (err) {
            console.error('Save error:', err);
            setError('저장 중 오류가 발생했습니다: ' + err.message);
            setTimeout(() => setError(null), 3000);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-t-[6px]">
                <div className="w-10 h-10 border-4 border-ios-indigo/20 border-t-ios-indigo rounded-full animate-spin mb-4" />
                <p className="text-sm font-bold text-ios-gray">공간 정보를 불러오는 중...</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-t-[6px] h-full flex flex-col overflow-hidden animate-spring-up">
            <div className="flex-1 overflow-y-auto scrollbar-hide p-8 pb-32">
                <div className="max-w-4xl mx-auto space-y-12">
                    
                    {/* Header Summary */}
                    <div className="flex items-center justify-between bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#1C1C1E] flex items-center justify-center shadow-lg">
                                <Box className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">학습 공간 관리</h2>
                                <p className="text-sm text-ios-gray font-bold">다중 학습 공간(Zone)과 각 공간별 세션을 운영합니다.</p>
                            </div>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 bg-ios-rose/10 px-4 py-2 rounded-lg border border-ios-rose/20 text-ios-rose font-bold text-xs animate-shake">
                                <AlertCircle className="w-4 h-4" /> {error}
                            </div>
                        )}
                    </div>

                    {/* Zone Management Section */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <Layout className="w-5 h-5 text-ios-amber" />
                                <h3 className="text-lg font-black text-[#1C1C1E]">학습 공간(Zone) 리스트</h3>
                            </div>
                            <button 
                                onClick={addZone}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1C1C1E] text-white rounded-lg text-xs font-bold shadow-lg hover:shadow-xl transition-all ios-tap"
                            >
                                <Plus className="w-4 h-4" /> 공간 추가
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {zones.map(zone => (
                                <div 
                                    key={zone.id}
                                    onClick={() => setSelectedZoneId(zone.id)}
                                    className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer group ${
                                        selectedZoneId === zone.id 
                                        ? 'bg-ios-indigo/5 border-ios-indigo shadow-md' 
                                        : 'bg-white border-gray-100 hover:border-gray-200'
                                    }`}
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-start justify-between">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${selectedZoneId === zone.id ? 'text-ios-indigo' : 'text-ios-gray'}`}>
                                                ZONE #{zone.id}
                                            </span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); renameZone(zone.id, zone.name); }} className="p-1.5 hover:bg-white rounded-md text-ios-gray hover:text-[#1C1C1E] shadow-sm"><Edit className="w-3 h-3" /></button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }} className="p-1.5 hover:bg-white rounded-md text-ios-gray hover:text-ios-rose shadow-sm"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                        <h4 className="text-lg font-black text-[#1C1C1E]">{zone.name}</h4>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${selectedZoneId === zone.id ? 'bg-ios-indigo animate-pulse' : 'bg-gray-300'}`} />
                                            <span className="text-[11px] font-bold text-ios-gray">
                                                {selectedZoneId === zone.id ? '현재 선택됨' : '선택하려면 클릭'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {selectedZoneId && (
                        <>
                            <hr className="border-gray-100" />
                            {/* Session Management Section */}
                            <section className="space-y-6 animate-fade-in">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <Clock className="w-5 h-5 text-ios-emerald" />
                                        <h3 className="text-lg font-black text-[#1C1C1E]">[{zones.find(z => z.id === selectedZoneId)?.name}] 세션 및 시간표</h3>
                                    </div>
                                    <button 
                                        onClick={addSession}
                                        className="flex items-center gap-2 px-4 py-2 bg-[#1C1C1E] text-white rounded-lg text-xs font-bold shadow-lg hover:shadow-xl transition-all ios-tap"
                                    >
                                        <PlusCircle className="w-4 h-4" /> 세션 추가
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                    {sessions.length === 0 ? (
                                        <div className="p-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                                            <p className="text-sm font-bold text-ios-gray">등록된 세션이 없습니다. '세션 추가'를 클릭하세요.</p>
                                        </div>
                                    ) : (
                                        sessions.map((session, sIdx) => (
                                            <div key={session.id} className="group flex items-center justify-between bg-white border border-gray-100 p-5 rounded-2xl hover:shadow-md transition-all">
                                                <div className="flex items-center gap-6 flex-1">
                                                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-[11px] font-black text-ios-gray border border-gray-100">
                                                        {sIdx + 1}
                                                    </div>
                                                    <div className="w-40">
                                                        <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest mb-1 block">세션 이름</label>
                                                        <input 
                                                            type="text" 
                                                            value={session.name || ''}
                                                            onChange={(e) => updateSessionField(session.id, 'name', e.target.value)}
                                                            className="text-sm font-black text-[#1C1C1E] bg-transparent border-none p-0 focus:ring-0 w-full"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-8">
                                                        <div>
                                                            <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest mb-1 block">시작</label>
                                                            <input 
                                                                type="time" 
                                                                value={session.start_time || ''}
                                                                onChange={(e) => updateSessionField(session.id, 'start_time', e.target.value)}
                                                                className="text-sm font-black text-[#1C1C1E] border-none p-0 bg-transparent focus:ring-0 w-32 pr-2"
                                                            />
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 text-gray-200 mt-4" />
                                                        <div>
                                                            <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest mb-1 block">종료</label>
                                                            <input 
                                                                type="time" 
                                                                value={session.end_time || ''}
                                                                onChange={(e) => updateSessionField(session.id, 'end_time', e.target.value)}
                                                                className="text-sm font-black text-[#1C1C1E] border-none p-0 bg-transparent focus:ring-0 w-32 pr-2"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => deleteSession(session.id)} className="p-2.5 text-ios-gray hover:text-ios-rose hover:bg-ios-rose/5 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>

            {/* Sticky Bottom Save Bar */}
            <div className="flex-none p-6 border-t border-gray-100 bg-white/80 backdrop-blur-xl z-20">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex-1 py-5 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all ios-tap shadow-lg ${
                            success 
                            ? 'bg-ios-emerald text-white' 
                            : 'bg-[#1C1C1E] text-white hover:bg-gray-800'
                        }`}
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : success ? (
                            <><CheckCircle2 className="w-5 h-5" /> 모든 설정 저장 완료</>
                        ) : (
                            <><Save className="w-5 h-5" /> 변경 사항 안전하게 저장하기</>
                        )}
                    </button>
                    {success && (
                        <div className="bg-ios-emerald/10 text-ios-emerald px-6 py-5 rounded-2xl font-black text-sm animate-fade-in flex items-center gap-2">
                            <Check className="w-4 h-4" /> 성공적으로 저장되었습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ZoneManagement;

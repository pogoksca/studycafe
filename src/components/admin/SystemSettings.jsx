import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Save, MapPin, Navigation, Radius, AlertCircle, 
  CheckCircle2, School, Clock, ListRestart, 
  PlusCircle, Edit, Trash2, Layout, Settings, 
  ChevronRight, Info, Plus, Check
} from 'lucide-react';

const SystemSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    
    // Global Settings
    const [schoolName, setSchoolName] = useState('GOE STUDY CAFE');
    const [schoolAddress, setSchoolAddress] = useState('');
    
    // Zone & Session States
    const [zones, setZones] = useState([]);
    const [selectedZoneId, setSelectedZoneId] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [gpsSettings, setGpsSettings] = useState({ points: [{ lat: 37.5665, lng: 126.9780, name: '기본 지점' }], radius: 100 });

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedZoneId) {
            fetchZoneSpecificData(selectedZoneId);
        }
    }, [selectedZoneId]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // 1. Fetch School Config
            const { data: configData } = await supabase.from('configs').select('*').eq('key', 'school_info').single();
            if (configData) {
                setSchoolName(configData.value.name || 'POGOK STUDY CAFE');
                setSchoolAddress(configData.value.address || '');
            }

            // 2. Fetch Zones
            const { data: zoneData, error: zoneError } = await supabase
                .from('zones')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: true });
            
            if (zoneError) throw zoneError;
            
            setZones(zoneData || []);
            if (zoneData && zoneData.length > 0) {
                setSelectedZoneId(zoneData[0].id);
            }
        } catch (err) {
            console.error('Error fetching initial data:', err);
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const fetchZoneSpecificData = async (zoneId) => {
        try {
            // Fetch Sessions
            const { data: sessionData, error: sessionError } = await supabase
                .from('sessions')
                .select('*')
                .eq('zone_id', zoneId)
                .order('start_time', { ascending: true });
            
            if (sessionError) throw sessionError;
            setSessions(sessionData || []);

            // Update GPS settings from Zone Settings
            const zone = zones.find(z => z.id === zoneId);
            if (zone?.settings) {
                // Migrate legacy settings if needed
                if (zone.settings.points) {
                    setGpsSettings(zone.settings);
                } else if (zone.settings.latitude) {
                    setGpsSettings({
                        points: [{ lat: zone.settings.latitude, lng: zone.settings.longitude, name: '기본 지점' }],
                        radius: zone.settings.radius || 100
                    });
                } else {
                    // Default fallback
                    setGpsSettings({ points: [{ lat: 37.5665, lng: 126.9780, name: '기본 지점' }], radius: 100 });
                }
            }
        } catch (err) {
            console.error('Error fetching zone data:', err);
            setError('세션 정보를 불러오는 중 오류가 발생했습니다.');
        }
    };

    // --- Zone Actions ---
    const addZone = async () => {
        const name = prompt('새 학습 공간의 이름을 입력하세요 (예: 제2학습실):');
        if (!name) return;

        setSaving(true);
        const { data, error } = await supabase
            .from('zones')
            .insert([{ name, settings: { points: [{ lat: 37.5665, lng: 126.9780, name: '기본 지점' }], radius: 100 } }])
            .select()
            .single();
        
        if (error) {
            alert('공간 추가 실패: ' + error.message);
        } else {
            setZones([...zones, data]);
            setSelectedZoneId(data.id);
        }
        setSaving(false);
    };

    const renameZone = async (id, currentName) => {
        const name = prompt('학습 공간의 이름을 수정하세요:', currentName);
        if (!name || name === currentName) return;

        setSaving(true);
        const { error } = await supabase
            .from('zones')
            .update({ name })
            .eq('id', id);
        
        if (error) {
            alert('이름 수정 실패: ' + error.message);
        } else {
            setZones(zones.map(z => z.id === id ? { ...z, name } : z));
        }
        setSaving(false);
    };

    const deleteZone = async (id) => {
        if (!confirm('정말 이 공간을 삭제하시겠습니까? 관련 세션 및 좌석 데이터가 무효화될 수 있습니다.')) return;

        setSaving(true);
        const { error } = await supabase
            .from('zones')
            .delete()
            .eq('id', id);
        
        if (error) {
            alert('공간 삭제 실패: ' + error.message);
        } else {
            const updated = zones.filter(z => z.id !== id);
            setZones(updated);
            if (updated.length > 0) setSelectedZoneId(updated[0].id);
        }
        setSaving(false);
    };

    // --- Session Actions ---
    const addSession = async () => {
        if (!selectedZoneId) return;
        const name = prompt('세션 이름을 입력하세요 (예: 3차시):');
        if (!name) return;

        const { data, error } = await supabase
            .from('sessions')
            .insert([{ zone_id: selectedZoneId, name, start_time: '09:00:00', end_time: '12:00:00' }])
            .select()
            .single();
        
        if (error) {
            alert('세션 추가 실패');
        } else {
            setSessions([...sessions, data]);
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

    const handleSaveAll = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            // 1. Save School Info
            await supabase.from('configs').upsert({
                key: 'school_info',
                value: { name: schoolName, address: schoolAddress }
            });

            // 2. Save Zone GPS Settings
            if (selectedZoneId) {
                await supabase.from('zones').update({
                    settings: gpsSettings
                }).eq('id', selectedZoneId);
            }

            // 3. Save Sessions
            if (sessions.length > 0) {
                const { error: sError } = await supabase.from('sessions').upsert(
                    sessions.map(s => ({
                        id: s.id,
                        zone_id: selectedZoneId,
                        name: s.name,
                        start_time: s.start_time,
                        end_time: s.end_time
                    }))
                );
                if (sError) throw sError;
            }

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-t-[6px]">
                <div className="w-10 h-10 border-4 border-ios-indigo/20 border-t-ios-indigo rounded-full animate-spin mb-4" />
                <p className="text-sm font-bold text-ios-gray">설정 데이터를 불러오는 중...</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-t-[6px] h-full flex flex-col overflow-hidden animate-spring-up">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-8 pb-32">
                <div className="max-w-4xl mx-auto space-y-12">
                    
                    {/* Header Summary */}
                    <div className="flex items-center justify-between bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#1C1C1E] flex items-center justify-center shadow-lg">
                                <Settings className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">시스템 전역 설정</h2>
                                <p className="text-sm text-ios-gray font-bold">학교 기본 정보 및 다중 학습 공간을 관리합니다.</p>
                            </div>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 bg-ios-rose/10 px-4 py-2 rounded-lg border border-ios-rose/20 text-ios-rose font-bold text-xs animate-shake">
                                <AlertCircle className="w-4 h-4" /> {error}
                            </div>
                        )}
                    </div>

                    {/* Section 1: School Info */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <School className="w-5 h-5 text-ios-indigo" />
                            <h3 className="text-lg font-black text-[#1C1C1E]">학교 기본 정보</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest ml-1">학교 이름</label>
                                <input 
                                    type="text" 
                                    value={schoolName}
                                    onChange={(e) => setSchoolName(e.target.value)}
                                    className="w-full bg-gray-50 border border-transparent focus:bg-white focus:border-ios-indigo/20 rounded-xl px-5 py-4 text-base font-bold text-[#1C1C1E] transition-all outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest ml-1">학교 주소</label>
                                <input 
                                    type="text" 
                                    value={schoolAddress}
                                    onChange={(e) => setSchoolAddress(e.target.value)}
                                    className="w-full bg-gray-50 border border-transparent focus:bg-white focus:border-ios-indigo/20 rounded-xl px-5 py-4 text-base font-bold text-[#1C1C1E] transition-all outline-none"
                                    placeholder="인증 서버 및 관리 대장용 주소"
                                />
                            </div>
                        </div>
                    </section>

                    <hr className="border-gray-100" />

                    {/* Section 2: Zone Management */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <Layout className="w-5 h-5 text-ios-amber" />
                                <h3 className="text-lg font-black text-[#1C1C1E]">학습 공간(Zone) 관리</h3>
                            </div>
                            <button 
                                onClick={addZone}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1C1C1E] text-white rounded-lg text-xs font-bold shadow-lg hover:shadow-xl transition-all ios-tap"
                            >
                                <Plus className="w-4 h-4" /> 공간 추가
                            </button>
                        </div>

                        {/* Zone Grid */}
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
                            {/* Section 3: Zone Specific Timetable */}
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
                                                            value={session.name}
                                                            onChange={(e) => updateSessionField(session.id, 'name', e.target.value)}
                                                            className="text-sm font-black text-[#1C1C1E] bg-transparent border-none p-0 focus:ring-0 w-full"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-8">
                                                        <div>
                                                            <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest mb-1 block">시작</label>
                                                            <input 
                                                                type="time" 
                                                                value={session.start_time}
                                                                onChange={(e) => updateSessionField(session.id, 'start_time', e.target.value)}
                                                                className="text-sm font-black text-[#1C1C1E] border-none p-0 bg-transparent focus:ring-0 w-32 pr-2"
                                                            />
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 text-gray-200 mt-4" />
                                                        <div>
                                                            <label className="text-[9px] font-black text-ios-gray uppercase tracking-widest mb-1 block">종료</label>
                                                            <input 
                                                                type="time" 
                                                                value={session.end_time}
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

                            <hr className="border-gray-100" />

                            {/* Section 4: Zone GPS & Safety */}
                            <section className="space-y-6 animate-fade-in">
                                <div className="flex items-center gap-3 mb-2">
                                    <Navigation className="w-5 h-5 text-ios-rose" />
                                    <h3 className="text-lg font-black text-[#1C1C1E]">출석 인증 및 안전 반경</h3>
                                </div>
                                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-8">
                                    <div className="flex items-start gap-3 p-4 bg-ios-amber/5 border border-ios-amber/10 rounded-xl">
                                        <Info className="w-4 h-4 text-ios-amber mt-0.5" />
                                        <p className="text-xs text-ios-amber font-bold leading-relaxed">
                                            출석 인증을 위해 여러 개의 GPS 인증 지점을 등록할 수 있습니다.<br/>
                                            ※접속하는 인터넷망의 종류에 따라 현재 위치가 다르게 표시될 수 있음.
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                             <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1.5 ml-1">인증 반경 설정</label>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Radius className="w-5 h-5 text-ios-indigo" />
                                            <div className="flex-1">
                                                <input 
                                                    type="number" 
                                                    value={gpsSettings.radius || 100}
                                                    onChange={(e) => setGpsSettings({...gpsSettings, radius: parseInt(e.target.value)})}
                                                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-[#1C1C1E] outline-none focus:ring-1 focus:ring-ios-indigo transition-all"
                                                    placeholder="허용 반경 (m)"
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-ios-gray">미터(m)</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                             <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                                 인증 지점 관리 ({gpsSettings.points?.length || 0}개)
                                             </label>
                                             {(!gpsSettings.points || gpsSettings.points.length < 3) && (
                                                 <button 
                                                    onClick={() => {
                                                        const newPoints = [...(gpsSettings.points || [])];
                                                        newPoints.push({ lat: 37.5665, lng: 126.9780, name: `지점 ${newPoints.length + 1}` });
                                                        setGpsSettings({ ...gpsSettings, points: newPoints });
                                                    }}
                                                    className="text-[10px] font-bold text-ios-indigo hover:bg-ios-indigo/10 px-2 py-1 rounded transition-colors"
                                                 >
                                                     + 지점 추가
                                                 </button>
                                             )}
                                        </div>
                                        
                                        <div className="space-y-3">
                                            {gpsSettings.points?.map((point, idx) => (
                                                <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <MapPin className="w-4 h-4 text-ios-rose" />
                                                        <input 
                                                            type="text"
                                                            value={point.name || `지점 ${idx + 1}`}
                                                            onChange={(e) => {
                                                                const newPoints = [...gpsSettings.points];
                                                                newPoints[idx].name = e.target.value;
                                                                setGpsSettings({ ...gpsSettings, points: newPoints });
                                                            }}
                                                            className="text-sm font-black text-[#1C1C1E] border-none p-0 focus:ring-0 w-32 bg-transparent"
                                                            placeholder="지점 이름"
                                                        />
                                                        {gpsSettings.points.length > 1 && (
                                                            <button 
                                                                onClick={() => {
                                                                    const newPoints = gpsSettings.points.filter((_, i) => i !== idx);
                                                                    setGpsSettings({ ...gpsSettings, points: newPoints });
                                                                }}
                                                                className="ml-auto p-1.5 text-gray-300 hover:text-ios-rose hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[9px] text-gray-400 font-bold mb-1 block">위도 (Latitude)</label>
                                                            <input 
                                                                type="number" step="0.000001"
                                                                value={point.lat}
                                                                onChange={(e) => {
                                                                    const newPoints = [...gpsSettings.points];
                                                                    newPoints[idx].lat = parseFloat(e.target.value);
                                                                    setGpsSettings({ ...gpsSettings, points: newPoints });
                                                                }}
                                                                className="w-full bg-gray-50/50 border border-gray-100 rounded-lg px-3 py-2 text-xs font-bold font-mono text-[#1C1C1E] focus:bg-white focus:border-ios-indigo transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-gray-400 font-bold mb-1 block">경도 (Longitude)</label>
                                                            <input 
                                                                type="number" step="0.000001"
                                                                value={point.lng}
                                                                onChange={(e) => {
                                                                    const newPoints = [...gpsSettings.points];
                                                                    newPoints[idx].lng = parseFloat(e.target.value);
                                                                    setGpsSettings({ ...gpsSettings, points: newPoints });
                                                                }}
                                                                className="w-full bg-gray-50/50 border border-gray-100 rounded-lg px-3 py-2 text-xs font-bold font-mono text-[#1C1C1E] focus:bg-white focus:border-ios-indigo transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
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
                        onClick={handleSaveAll}
                        disabled={saving}
                        className={`flex-1 py-5 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all ios-tap shadow-lg ${
                            success 
                            ? 'bg-[#1C1C1E] text-white' 
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
                            <Check className="w-4 h-4" /> 완벽합니다!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SystemSettings;

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
    const [schoolName, setSchoolName] = useState('');
    const [schoolNameEn, setSchoolNameEn] = useState('');
    const [schoolLevel, setSchoolLevel] = useState('고등학교');
    
    // GPS & Safety States
    const [gpsSettings, setGpsSettings] = useState({ 
        points: [{ lat: 37.5665, lng: 126.9780, name: '기본 지점' }], 
        radius: 100 
    });

    // Simple setter for global state
    const updateGpsSettings = (newSettings) => {
        setGpsSettings(newSettings);
    };

    useEffect(() => {
        fetchInitialData();
    }, []);


    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // 1. Fetch School Config
            const { data: configData, error: configError } = await supabase.from('configs').select('*').eq('key', 'school_info').single();
            if (configError && configError.code !== 'PGRST116') throw configError;
            
            if (configData) {
                setSchoolName(configData.value.name || '');
                setSchoolNameEn(configData.value.name_en || '');
                setSchoolLevel(configData.value.level || '고등학교');
            }

            // 3. Fetch GPS Config (Global)
            const { data: gpsData, error: gpsError } = await supabase.from('configs').select('*').eq('key', 'gps_settings').single();
            if (gpsError && gpsError.code !== 'PGRST116') throw gpsError;
            
            if (gpsData?.value) {
                // Migrate legacy latitude/longitude to points if needed
                if (gpsData.value.points) {
                    setGpsSettings(gpsData.value);
                } else if (gpsData.value.lat) {
                    setGpsSettings({
                        points: [{ lat: gpsData.value.lat, lng: gpsData.value.lng, name: '기본 지점' }],
                        radius: gpsData.value.radius || 100
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching initial data:', err);
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };





    const handleSaveAll = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            // 1. Save School Info
            await supabase.from('configs').upsert({
                key: 'school_info',
                value: { 
                    name: schoolName, 
                    name_en: schoolNameEn, 
                    level: schoolLevel 
                }
            });

            // 2. Save GPS Settings (Global)
            const { error: gError } = await supabase.from('configs').upsert({
                key: 'gps_settings',
                value: gpsSettings
            });
            if (gError) throw gError;


            setSuccess(true);
            setTimeout(() => setSuccess(false), 2000);
        } catch (err) {
            console.error('Save error:', err);
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
                                <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">환경 설정</h2>
                                <p className="text-sm text-ios-gray font-bold">학교 기본 정보 및 출석 인증 안전 반경을 관리합니다.</p>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-min">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest ml-1">학교 한글명</label>
                                <input 
                                    type="text" 
                                    value={schoolName}
                                    onChange={(e) => setSchoolName(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-100 focus:bg-white focus:border-ios-indigo/20 rounded-xl px-5 py-4 text-base font-bold text-[#1C1C1E] transition-all outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest ml-1">학교 영문명 (브랜딩용)</label>
                                <input 
                                    type="text" 
                                    value={schoolNameEn}
                                    onChange={(e) => setSchoolNameEn(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-100 focus:bg-white focus:border-ios-indigo/20 rounded-xl px-5 py-4 text-base font-bold text-[#1C1C1E] transition-all outline-none"
                                    placeholder="APP 상단 타이틀 등에 사용됩니다."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest ml-1">학교급</label>
                                <div className="relative">
                                    <select 
                                        value={schoolLevel}
                                        onChange={(e) => setSchoolLevel(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-100 focus:bg-white focus:border-ios-indigo/20 rounded-xl px-5 py-4 text-base font-bold text-[#1C1C1E] transition-all outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="고등학교">고등학교</option>
                                        <option value="중학교">중학교</option>
                                        <option value="학교">학교</option>
                                    </select>
                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-ios-gray">
                                        <Settings className="w-4 h-4 opacity-30" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <hr className="border-gray-100" />

                    {/* Section 2: Global GPS & Safety */}
                    <section className="space-y-6 animate-fade-in">
                        <div className="flex items-center gap-3 mb-2">
                            <Navigation className="w-5 h-5 text-ios-rose" />
                            <h3 className="text-lg font-black text-[#1C1C1E]">출석 인증 안전 반경</h3>
                        </div>
                        <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-8">
                            <div className="flex items-start gap-3 p-4 bg-ios-amber/5 border border-ios-amber/10 rounded-xl">
                                <Info className="w-4 h-4 text-ios-amber mt-0.5" />
                                <p className="text-xs text-ios-amber font-bold leading-relaxed">
                                    출석 인증을 위해 여러 개의 GPS 인증 지점을 등록할 수 있습니다.<br/>
                                    ※ 이 설정은 모든 학습 공간(Zone)에 공통으로 적용됩니다.
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
                                            onChange={(e) => updateGpsSettings({...gpsSettings, radius: parseInt(e.target.value)})}
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
                                     {(!gpsSettings.points || gpsSettings.points.length < 10) && (
                                         <button 
                                            onClick={() => {
                                                const newPoints = [...(gpsSettings.points || [])];
                                                newPoints.push({ lat: 37.5665, lng: 126.9780, name: `지점 ${newPoints.length + 1}` });
                                                updateGpsSettings({ ...gpsSettings, points: newPoints });
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
                                                        updateGpsSettings({ ...gpsSettings, points: newPoints });
                                                    }}
                                                    className="text-sm font-black text-[#1C1C1E] border-none p-0 focus:ring-0 w-32 bg-transparent"
                                                    placeholder="지점 이름"
                                                />
                                                {gpsSettings.points.length > 1 && (
                                                    <button 
                                                        onClick={() => {
                                                            const newPoints = gpsSettings.points.filter((_, i) => i !== idx);
                                                            updateGpsSettings({ ...gpsSettings, points: newPoints });
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
                                                            updateGpsSettings({ ...gpsSettings, points: newPoints });
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
                                                            updateGpsSettings({ ...gpsSettings, points: newPoints });
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

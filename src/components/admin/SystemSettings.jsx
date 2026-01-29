import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, MapPin, Navigation, Radius, AlertCircle, CheckCircle2 } from 'lucide-react';

const SystemSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [settings, setSettings] = useState({
        lat: 37.5665,
        lng: 126.9780,
        radius: 100
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        const { data, error: fetchError } = await supabase
            .from('configs')
            .select('value')
            .eq('key', 'gps_settings')
            .single();

        if (data) {
            setSettings(data.value);
        } else if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is 'no rows'
            setError('설정을 불러오는 중 오류가 발생했습니다.');
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess(false);

        const { error: upsertError } = await supabase
            .from('configs')
            .upsert({ 
                key: 'gps_settings', 
                value: settings,
                updated_at: new Date().toISOString()
            });

        if (upsertError) {
            setError('설정 저장 중 오류가 발생했습니다.');
        } else {
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1C1C1E]"></div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-t-[6px] rounded-b-none p-8 h-full space-y-8 animate-spring-up overflow-y-auto scrollbar-hide">
            <div className="max-w-2xl mx-auto space-y-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[6px] bg-ios-indigo/10 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-ios-indigo" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black tracking-tight text-[#1C1C1E]">출석 인증 GPS 설정</h3>
                        <p className="text-xs text-ios-gray font-medium">자기주도 출석 인증이 허용되는 지리적 범위를 설정합니다.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1.5">
                            <Navigation className="w-3 h-3" /> 위도 (Latitude)
                        </label>
                        <input 
                            type="number" 
                            step="0.000001"
                            value={settings.lat}
                            onChange={(e) => setSettings({...settings, lat: parseFloat(e.target.value)})}
                            className="w-full bg-gray-50 border border-gray-100 rounded-[6px] p-4 text-base font-black text-[#1C1C1E] focus:ring-1 focus:ring-ios-indigo transition-all"
                            placeholder="예: 37.5665"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1.5">
                            <Navigation className="w-3 h-3" /> 경도 (Longitude)
                        </label>
                        <input 
                            type="number" 
                            step="0.000001"
                            value={settings.lng}
                            onChange={(e) => setSettings({...settings, lng: parseFloat(e.target.value)})}
                            className="w-full bg-gray-50 border border-gray-100 rounded-[6px] p-4 text-base font-black text-[#1C1C1E] focus:ring-1 focus:ring-ios-indigo transition-all"
                            placeholder="예: 126.9780"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1.5">
                            <Radius className="w-3 h-3" /> 허용 반경 (Radius, 미터 단위)
                        </label>
                        <input 
                            type="number" 
                            value={settings.radius}
                            onChange={(e) => setSettings({...settings, radius: parseInt(e.target.value)})}
                            className="w-full bg-gray-50 border border-gray-100 rounded-[6px] p-4 text-base font-black text-[#1C1C1E] focus:ring-1 focus:ring-ios-indigo transition-all"
                            placeholder="예: 100"
                        />
                    </div>
                </div>

                <div className="bg-amber-50 p-6 rounded-[6px] border border-amber-100/50 space-y-2">
                    <p className="font-black text-ios-amber text-[9px] uppercase tracking-widest flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3" /> 설정 도움말
                    </p>
                    <ul className="text-amber-900/70 text-xs leading-relaxed font-medium list-disc list-inside space-y-1">
                        <li>위도와 경도는 소수점 6째 자리까지 입력하면 약 10cm 단위의 정밀도를 가집니다.</li>
                        <li>반경은 미터(m) 단위이며, 건물 크기와 GPS 오차를 고려해 50~100m 정도를 권장합니다.</li>
                        <li>참고: 구글 지도나 네이버 지도에서 위치를 우클릭하여 좌표를 쉽게 복사할 수 있습니다.</li>
                    </ul>
                </div>

                {error && (
                    <div className="p-4 bg-ios-rose/5 border border-ios-rose/10 rounded-[6px] flex items-center gap-2 animate-shake">
                        <AlertCircle className="w-4 h-4 text-ios-rose" />
                        <p className="text-[11px] font-black text-ios-rose">{error}</p>
                    </div>
                )}

                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className={`w-full py-5 rounded-[6px] font-black text-base transition-all flex items-center justify-center gap-3 ios-tap ${
                        success 
                        ? 'bg-ios-emerald text-white' 
                        : 'bg-[#1C1C1E] text-white shadow-lg shadow-black/20'
                    }`}
                >
                    {saving ? '저장 중...' : success ? (
                        <>
                            <CheckCircle2 className="w-5 h-5" /> 저장 완료
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5" /> 설정 저장하기
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default SystemSettings;

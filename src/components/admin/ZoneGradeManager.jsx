import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  ShieldCheck, Layout, Save, CheckCircle2, 
  AlertCircle, ChevronRight, ToggleLeft, ToggleRight,
  Box, ChevronDown, ChevronUp, Check
} from 'lucide-react';

const GradeCheckbox = ({ grade, isChecked, onChange }) => (
    <button
        onClick={() => onChange(grade)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${
            isChecked 
            ? 'bg-ios-indigo border-ios-indigo text-white shadow-md' 
            : 'bg-white border-gray-100 text-ios-gray hover:border-gray-200'
        }`}
    >
        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
            isChecked ? 'bg-white border-white' : 'bg-gray-50 border-gray-200'
        }`}>
            {isChecked && <Check className="w-3 h-3 text-ios-indigo" strokeWidth={4} />}
        </div>
        <span className="text-xs font-black">{grade}학년</span>
    </button>
);

const ZoneGradeManager = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    
    const [zones, setZones] = useState([]); // Learning Spaces
    const [subZonesBySpace, setSubZonesBySpace] = useState({}); // { zone_id: [ { name: 'A', allowedGrades: [1, 2] }, ... ] }
    const [isGlobalEnabled, setIsGlobalEnabled] = useState(false);
    
    const [expandedSpaceId, setExpandedSpaceId] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: zonesData, error: zonesError } = await supabase
                .from('zones')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: true });
            
            if (zonesError) throw zonesError;
            setZones(zonesData || []);
            if (zonesData?.length > 0) setExpandedSpaceId(zonesData[0].id);

            const { data: seatsData, error: seatsError } = await supabase
                .from('seats')
                .select('zone_id, zone_name')
                .not('zone_name', 'is', null);
            
            if (seatsError) throw seatsError;

            const [enabledConfig, restrictionsConfig] = await Promise.all([
                supabase.from('configs').select('value').eq('key', 'grade_restriction_enabled').maybeSingle(),
                supabase.from('configs').select('value').eq('key', 'sub_zone_grade_restrictions').maybeSingle()
            ]);

            setIsGlobalEnabled(!!enabledConfig.data?.value);
            const savedRestrictions = restrictionsConfig.data?.value || {}; // { "zone_id": { "sub_zone_name": [grades] } }

            const grouped = {};
            seatsData.forEach(s => {
                if (!grouped[s.zone_id]) grouped[s.zone_id] = new Set();
                grouped[s.zone_id].add(s.zone_name);
            });

            const subZoneSettings = {};
            for (const zId in grouped) {
                const spaceRestrictions = savedRestrictions[zId] || {};
                subZoneSettings[zId] = Array.from(grouped[zId]).sort().map(name => {
                    let allowedVal = spaceRestrictions[name];
                    // Legacy Support: Convert single number to array
                    if (allowedVal !== null && typeof allowedVal === 'number') {
                        allowedVal = [allowedVal];
                    }
                    return {
                        name,
                        allowedGrades: allowedVal || [] // Empty array means NO restriction (everyone allowed) or explicitly handle
                    };
                });
            }
            setSubZonesBySpace(subZoneSettings);

        } catch (err) {
            console.error('Error fetching data:', err);
            setError('정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleGrade = (spaceId, subZoneName, grade) => {
        setSubZonesBySpace(prev => {
            const spaceZones = [...(prev[spaceId] || [])];
            const idx = spaceZones.findIndex(sz => sz.name === subZoneName);
            if (idx > -1) {
                const currentGrades = [...spaceZones[idx].allowedGrades];
                const gradeIdx = currentGrades.indexOf(grade);
                
                if (gradeIdx > -1) {
                    currentGrades.splice(gradeIdx, 1);
                } else {
                    currentGrades.push(grade);
                }
                
                spaceZones[idx] = { ...spaceZones[idx], allowedGrades: currentGrades.sort() };
            }
            return { ...prev, [spaceId]: spaceZones };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            await supabase.from('configs').upsert({ 
                key: 'grade_restriction_enabled', 
                value: isGlobalEnabled 
            });

            const restrictions = {};
            for (const spaceId in subZonesBySpace) {
                const spaceMap = {};
                subZonesBySpace[spaceId].forEach(sz => {
                    if (sz.allowedGrades.length > 0) spaceMap[sz.name] = sz.allowedGrades;
                });
                if (Object.keys(spaceMap).length > 0) {
                    restrictions[spaceId] = spaceMap;
                }
            }

            await supabase.from('configs').upsert({ 
                key: 'sub_zone_grade_restrictions', 
                value: restrictions 
            });

            setSuccess(true);
            setTimeout(() => setSuccess(false), 2000);

        } catch (err) {
            console.error('Save error:', err);
            setError('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-white">
                <div className="w-10 h-10 border-4 border-ios-indigo/20 border-t-ios-indigo rounded-full animate-spin mb-4" />
                <p className="text-sm font-bold text-ios-gray">정보를 불러오는 중...</p>
            </div>
        );
    }

    return (
        <div className="bg-white h-full flex flex-col overflow-hidden animate-spring-up font-sans">
            <div className="flex-1 overflow-y-auto scrollbar-hide p-8 pb-32">
                <div className="max-w-3xl mx-auto space-y-12">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#1C1C1E] flex items-center justify-center shadow-lg">
                                <ShieldCheck className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-[#1C1C1E] tracking-tight">구역별 학년 지정</h2>
                                <p className="text-sm text-ios-gray font-bold">세부 구역(Section A, B, C 등)을 특정 학년 전용으로 제한합니다.</p>
                            </div>
                        </div>
                    </div>

                    {/* Global Toggle Section */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isGlobalEnabled ? 'bg-ios-indigo/10' : 'bg-gray-100'}`}>
                                    {isGlobalEnabled ? <ToggleRight className="w-5 h-5 text-ios-indigo" /> : <ToggleLeft className="w-5 h-5 text-ios-gray" />}
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-[#1C1C1E]">구역별 학년 제한 활성화</h4>
                                    <p className="text-[11px] text-ios-gray font-bold italic">ON 상태일 때만 아래 구역별 제한 규칙이 적용됩니다.</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsGlobalEnabled(!isGlobalEnabled)}
                                className={`w-14 h-8 rounded-full transition-all relative ${isGlobalEnabled ? 'bg-ios-indigo' : 'bg-gray-200'}`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all ${isGlobalEnabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Learning Spaces Accordion */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-3">
                            <Layout className="w-5 h-5 text-ios-amber" />
                            <h3 className="text-lg font-black text-[#1C1C1E]">학습 공간 내 구역 설정</h3>
                        </div>

                        <div className="space-y-4">
                            {zones.map(space => {
                                const subZones = subZonesBySpace[space.id] || [];
                                const isExpanded = expandedSpaceId === space.id;
                                
                                return (
                                    <div key={space.id} className={`rounded-3xl border transition-all ${isExpanded ? 'border-ios-indigo shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                                        <button 
                                            onClick={() => setExpandedSpaceId(isExpanded ? null : space.id)}
                                            className="w-full flex items-center justify-between p-6 text-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isExpanded ? 'bg-ios-indigo/10 border-ios-indigo text-ios-indigo' : 'bg-gray-50 border-gray-100 text-ios-gray'}`}>
                                                    <Box className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-black text-[#1C1C1E]">{space.name}</h4>
                                                    <p className="text-[10px] text-ios-gray font-bold uppercase tracking-widest mt-0.5">
                                                        {subZones.length}개의 구역 탐지됨
                                                    </p>
                                                </div>
                                            </div>
                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-ios-indigo" /> : <ChevronDown className="w-5 h-5 text-ios-gray" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="px-6 pb-6 pt-2 border-t border-gray-50 animate-fade-in">
                                                {subZones.length === 0 ? (
                                                    <div className="py-8 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                                        <p className="text-xs font-bold text-ios-gray">이 공간에는 지정된 세부 구역(A, B, C 등)이 없습니다.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {subZones.map(sz => (
                                                            <div key={sz.name} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white border border-gray-100 rounded-3xl gap-4">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-xs font-black text-[#1C1C1E] border border-gray-100">
                                                                        {sz.name}
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-sm font-black text-[#1C1C1E]">{sz.name} Zone</span>
                                                                        <p className="text-[10px] text-ios-gray font-bold italic">허용할 학년을 모두 선택하세요</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <GradeCheckbox 
                                                                        grade={1} 
                                                                        isChecked={sz.allowedGrades.includes(1)} 
                                                                        onChange={(g) => handleToggleGrade(space.id, sz.name, g)} 
                                                                    />
                                                                    <GradeCheckbox 
                                                                        grade={2} 
                                                                        isChecked={sz.allowedGrades.includes(2)} 
                                                                        onChange={(g) => handleToggleGrade(space.id, sz.name, g)} 
                                                                    />
                                                                    <GradeCheckbox 
                                                                        grade={3} 
                                                                        isChecked={sz.allowedGrades.includes(3)} 
                                                                        onChange={(g) => handleToggleGrade(space.id, sz.name, g)} 
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Disclaimer */}
                    <div className="bg-ios-indigo/5 p-6 rounded-2xl border border-ios-indigo/10 flex items-start gap-4">
                        <AlertCircle className="w-5 h-5 text-ios-indigo shrink-0 mt-1" />
                        <div className="space-y-1">
                            <h5 className="text-[13px] font-black text-ios-indigo">유의사항</h5>
                            <p className="text-[11px] text-ios-indigo/70 font-bold leading-relaxed">
                                • 아무 학년도 선택하지 않으면 해당 구역은 **모든 학년**이 이용 가능합니다. (제한 없음)<br/>
                                • 특정 학년만 체크하면, 체크된 학년의 학생만 예약할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Bottom Save Bar */}
            <div className="flex-none p-6 border-t border-gray-100 bg-white/80 backdrop-blur-xl z-20">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
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
                            <><CheckCircle2 className="w-5 h-5" /> 설정 저장 완료</>
                        ) : (
                            <><Save className="w-5 h-5" /> 설정 저장하기</>
                        )}
                    </button>
                    {error && (
                        <div className="bg-ios-rose/10 text-ios-rose px-6 py-5 rounded-2xl font-black text-sm animate-shake flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ZoneGradeManager;

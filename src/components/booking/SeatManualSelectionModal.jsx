import React, { useState, useEffect } from 'react';
import { X, ChevronUp, ChevronDown, Info, CheckCircle2, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const SeatManualSelectionModal = ({ isOpen, onClose, zoneId, onSelect, currentUser, onOpenMap }) => {
    const [loading, setLoading] = useState(false);
    const [zoneSeats, setZoneSeats] = useState([]);
    const [selectedSection, setSelectedSection] = useState('A');
    const [selectedSeatNumber, setSelectedSeatNumber] = useState('');
    const [zoneName, setZoneName] = useState('');
    const [restrictionSettings, setRestrictionSettings] = useState({ enabled: false, restrictions: {} });

    // Helper: Get clean seat number (strip section prefix)
    const getCleanSeatNumber = (seat) => {
        if (!seat) return '';
        const rawNum = seat.seat_number.toString();
        const section = seat.zone_name || '';
        
        if (section && rawNum.startsWith(`${section}-`)) {
            return rawNum.replace(`${section}-`, '');
        }
        if (section && rawNum.startsWith(section)) {
            return rawNum.replace(section, '');
        }
        return rawNum;
    };

    useEffect(() => {
        if (!isOpen || !zoneId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Zone Info
                const { data: zoneData } = await supabase
                    .from('zones')
                    .select('name')
                    .eq('id', zoneId)
                    .single();
                if (zoneData) setZoneName(zoneData.name);

                // 2. Fetch Seats for this Zone
                const { data: seatsRes } = await supabase
                    .from('seats')
                    .select('*')
                    .eq('zone_id', zoneId)
                    .order('global_number');
                setZoneSeats(seatsRes || []);

                // 3. Fetch Restriction Settings
                const [configRes, restrRes] = await Promise.all([
                    supabase.from('configs').select('value').eq('key', 'grade_restriction_enabled').maybeSingle(),
                    supabase.from('configs').select('value').eq('key', 'sub_zone_grade_restrictions').maybeSingle()
                ]);
                setRestrictionSettings({
                    enabled: !!configRes.data?.value,
                    restrictions: restrRes.data?.value || {}
                });

                // Set initial section
                if (seatsRes && seatsRes.length > 0) {
                    setSelectedSection(seatsRes[0].zone_name || 'A');
                    setSelectedSeatNumber(getCleanSeatNumber(seatsRes[0]));
                }
            } catch (err) {
                console.error("Error fetching data for manual selection:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, zoneId]);

    const getSections = () => {
        const sections = new Set();
        zoneSeats.forEach(s => {
            if (s.zone_name) sections.add(s.zone_name);
        });
        return Array.from(sections).sort();
    };

    const sections = getSections();

    const cycleSection = (direction) => {
        if (sections.length === 0) return;
        let currentIndex = sections.indexOf(selectedSection);
        if (currentIndex === -1) currentIndex = 0;

        let nextIndex;
        if (direction === 'up') {
            nextIndex = (currentIndex - 1 + sections.length) % sections.length;
        } else {
            nextIndex = (currentIndex + 1) % sections.length;
        }
        
        const nextSection = sections[nextIndex];
        setSelectedSection(nextSection);
        
        // Pick first seat of next section
        const firstSeat = zoneSeats.find(s => (s.zone_name || '') === nextSection);
        if (firstSeat) setSelectedSeatNumber(getCleanSeatNumber(firstSeat));
    };

    const cycleSeat = (direction) => {
        const sectionSeats = zoneSeats.filter(s => (s.zone_name || '') === selectedSection);
        if (sectionSeats.length === 0) return;

        const sortedSeats = [...sectionSeats].sort((a, b) => {
            const numA = parseInt(a.seat_number.toString().replace(/\D/g, '')) || 0;
            const numB = parseInt(b.seat_number.toString().replace(/\D/g, '')) || 0;
            return numA - numB;
        });

        const currentSeat = sortedSeats.find(s => getCleanSeatNumber(s) === selectedSeatNumber.toString());
        let nextIndex = 0;
        if (currentSeat) {
            const currentIndex = sortedSeats.indexOf(currentSeat);
            if (direction === 'up') {
                nextIndex = (currentIndex - 1 + sortedSeats.length) % sortedSeats.length;
            } else {
                nextIndex = (currentIndex + 1) % sortedSeats.length;
            }
        }
        setSelectedSeatNumber(getCleanSeatNumber(sortedSeats[nextIndex]));
    };

    const handleConfirm = () => {
        const seat = zoneSeats.find(s => 
            (s.zone_name || '') === selectedSection && 
            getCleanSeatNumber(s) === selectedSeatNumber.toString()
        );
        if (!seat) return alert('존재하지 않는 좌석입니다.');
        onSelect(seat);
        onClose();
    };

    if (!isOpen) return null;

    const studentName = currentUser?.full_name || '학생';
    const studentId = currentUser?.username || '';
    const studentGrade = parseInt(studentId.substring(0, 1)) || 0;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#F2F2F7] w-full max-w-sm rounded-[32px] overflow-hidden flex flex-col shadow-2xl relative">
                <div className="bg-white px-6 py-8">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black text-[#1C1C1E]">{zoneName} 좌석 선택</h3>
                        <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-black">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <p className="text-sm font-bold text-ios-gray mb-4">구역(Section)을 선택한 후 번호를 입력해주세요.</p>

                    <div className="bg-ios-rose/5 p-4 rounded-2xl border border-ios-rose/10 flex items-start gap-3 mb-6">
                        <div className="mt-0.5"><Info className="w-4 h-4 text-ios-rose" /></div>
                        <p className="text-[11px] font-bold text-[#1C1C1E] leading-relaxed">
                            {studentName}님의 학년({studentGrade || '?'}학년)이 이용 가능한 구역을 선택해주세요.
                            <br/>
                            <span className="text-ios-rose font-bold">
                                {(() => {
                                    if (!restrictionSettings.enabled) return "현재 모든 구역을 자유롭게 이용할 수 있습니다.";
                                    const spaceRestr = restrictionSettings.restrictions[zoneId] || {};
                                    const allowedAreas = Object.keys(spaceRestr).filter(area => (spaceRestr[area] || []).includes(studentGrade));
                                    const restrictedAreas = Object.keys(spaceRestr).filter(area => !(spaceRestr[area] || []).includes(studentGrade));
                                    if (allowedAreas.length === 0 && restrictedAreas.length > 0) return "학습 공간 내 모든 구역이 이용 불가능합니다.";
                                    if (restrictedAreas.length === 0) return "현재 모든 구역을 이용할 수 있습니다.";
                                    return `${allowedAreas.join(', ')} 구역을 이용하실 수 있습니다. (${restrictedAreas.join(', ')} 제외)`;
                                })()}
                            </span>
                        </p>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-[24px] border border-gray-100 flex gap-4">
                        <div className="flex-1 flex flex-col items-center gap-2">
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest">구역 (SECTION)</label>
                            <button onClick={() => cycleSection('up')} className="p-2 text-gray-300 hover:text-ios-indigo transition-colors"><ChevronUp className="w-6 h-6" /></button>
                            <div className="h-16 flex items-center justify-center">
                                <span className="text-5xl font-black text-[#1C1C1E]">{selectedSection || '-'}</span>
                            </div>
                            <button onClick={() => cycleSection('down')} className="p-2 text-gray-300 hover:text-ios-indigo transition-colors"><ChevronDown className="w-6 h-6" /></button>
                        </div>
                        <div className="w-px bg-gray-200 my-4"></div>
                        <div className="flex-1 flex flex-col items-center gap-2">
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest">번호 (NO.)</label>
                            <button onClick={() => cycleSeat('up')} className="p-2 text-gray-300 hover:text-ios-indigo transition-colors"><ChevronUp className="w-6 h-6" /></button>
                            <div className="h-16 flex items-center justify-center">
                                <input 
                                    type="text" 
                                    value={selectedSeatNumber} 
                                    onChange={(e) => setSelectedSeatNumber(e.target.value)}
                                    className="w-full text-5xl font-black text-center border-none focus:ring-0 outline-none bg-transparent text-[#1C1C1E] p-0"
                                />
                            </div>
                            <button onClick={() => cycleSeat('down')} className="p-2 text-gray-300 hover:text-ios-indigo transition-colors"><ChevronDown className="w-6 h-6" /></button>
                        </div>
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                        <button 
                            onClick={() => {
                                onOpenMap();
                                onClose();
                            }}
                            className="w-full py-4 rounded-xl bg-gray-50 hover:bg-gray-100 text-[#1C1C1E] font-bold text-sm flex items-center justify-center gap-2 transition-all border border-gray-200 shadow-sm"
                        >
                            <MapPin className="w-4 h-4" />
                            좌석 배치도 보기
                        </button>
                    </div>

                    <button 
                        onClick={handleConfirm}
                        className="w-full mt-8 py-5 bg-[#1C1C1E] text-white rounded-[20px] font-black text-base shadow-lg shadow-black/10 active:scale-[0.98] transition-all"
                    >
                        좌석 선택 완료
                    </button>
                    
                    <button 
                        onClick={onClose}
                        className="w-full mt-3 py-4 text-ios-gray font-bold text-sm"
                    >
                        취소
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SeatManualSelectionModal;

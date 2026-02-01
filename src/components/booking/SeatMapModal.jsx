import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import SeatBookingMap from './SeatBookingMap';
import { format } from 'date-fns';

const SeatMapModal = ({ isOpen, onClose, zoneId, onSelect, selectedDate }) => {
    const [showGuide, setShowGuide] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setShowGuide(true);
        }
    }, [isOpen]);

    if (!isOpen) return null;
    
    const formattedDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
             <div className="bg-white w-full h-[80vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl relative">
                  
                  {/* Floating Close Button */}
                  <button 
                      onClick={onClose} 
                      className="absolute top-4 right-4 z-50 p-2 bg-white/90 backdrop-blur rounded-full shadow-lg text-black hover:bg-gray-100 transition-all border border-gray-100"
                  >
                      <X className="w-6 h-6" />
                  </button>

                  {/* Body - Map Wrapper */}
                  <div className="flex-1 bg-gray-50 relative overflow-hidden">
                       <SeatBookingMap 
                           viewDate={formattedDate}
                           selectedZoneId={zoneId}
                           onDateChange={() => {}}
                           onZoneChange={() => {}}
                           isReadOnly={true}
                           minimal={true} 
                           onSelectSeat={onSelect} 
                       />
                  </div>
             </div>
             {/* Instruction Overlay */}
             {showGuide && (
                <div className="absolute inset-0 z-[10000] flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowGuide(false)}>
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-2xl max-w-xs w-full text-center border border-gray-100 transform transition-all scale-100 relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        
                        <div className="mb-4 flex justify-center">
                            <div className="w-12 h-12 rounded-full bg-ios-indigo/10 flex items-center justify-center">
                                <span className="text-2xl">👆</span>
                            </div>
                        </div>

                        <h3 className="text-lg font-black text-gray-900 mb-2">좌석 선택 방법</h3>
                        
                        <p className="text-gray-600 text-[15px] font-medium leading-relaxed break-keep mb-6">
                            예약하고 싶은 좌석을<br/>
                            <span className="text-[#FF3B30] font-black text-lg">더블 클릭(또는 더블 터치)</span><br/>
                            로 선택하세요.
                        </p>

                        <button 
                            onClick={() => setShowGuide(false)}
                            className="w-full py-3.5 bg-[#1C1C1E] text-white rounded-xl font-bold text-sm hover:bg-gray-800 active:scale-95 transition-all shadow-lg shadow-gray-200"
                        >
                            확인했습니다
                        </button>
                    </div>
                </div>
             )}
        </div>
    );
};

export default SeatMapModal;

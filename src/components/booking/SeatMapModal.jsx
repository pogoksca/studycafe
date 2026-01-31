import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import SeatBookingMap from './SeatBookingMap';
import { format } from 'date-fns';

const SeatMapModal = ({ isOpen, onClose, zoneId, onSelect }) => {
    if (!isOpen) return null;
    
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
                           viewDate={format(new Date(), 'yyyy-MM-dd')}
                           selectedZoneId={zoneId}
                           onDateChange={() => {}}
                           onZoneChange={() => {}}
                           isReadOnly={true}
                           minimal={true} 
                           onSelectSeat={onSelect} 
                       />
                  </div>
             </div>
        </div>
    );
};

export default SeatMapModal;

import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';

const DateSessionSelector = ({ 
    selectedDate, 
    onDateChange, 
    sessions, 
    activeSessionId, 
    onSessionChange,
    zones,
    selectedZoneId,
    onZoneChange,
    showSessions = true,
    className = "" 
}) => {
    
    const handlePrevDate = () => {
        const newDate = subDays(new Date(selectedDate), 1);
        onDateChange(format(newDate, 'yyyy-MM-dd'));
    };

    const handleNextDate = () => {
        const newDate = addDays(new Date(selectedDate), 1);
        onDateChange(format(newDate, 'yyyy-MM-dd'));
    };

    return (
        <div className={`flex flex-col gap-3 ${className} mb-4`}>
            {/* Zone Selector */}
            {zones && zones.length > 0 && (
                <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide -mx-1 px-1">
                    {zones.map((zone) => {
                        const isSelected = selectedZoneId === zone.id;
                        return (
                            <button
                                key={zone.id}
                                onClick={() => onZoneChange(zone.id)}
                                className={`
                                    flex-none px-4 py-3 rounded-2xl border transition-all font-black text-sm
                                    ${isSelected
                                        ? 'bg-[#1C1C1E] text-white border-[#1C1C1E] shadow-md'
                                        : 'bg-white text-gray-400 border-gray-100'
                                    }
                                `}
                            >
                                {zone.name}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Date Selector */}
            <div className="flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm border border-gray-100 mb-1">
                <button 
                    onClick={handlePrevDate}
                    className="p-2 hover:bg-gray-50 rounded-full text-gray-400 hover:text-black transition-colors active:scale-95"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex flex-col items-center">
                    <span className="text-base font-black text-[#1C1C1E] tracking-tight flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-ios-indigo" />
                        {format(new Date(selectedDate), 'yyyy년 M월 d일 (eee)', { locale: ko })}
                    </span>
                </div>

                <button 
                    onClick={handleNextDate}
                    className="p-2 hover:bg-gray-50 rounded-full text-gray-400 hover:text-black transition-colors active:scale-95"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Session Selector (Horizontal Scroll) */}
            {showSessions && (sessions.length > 0 ? (
                <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide -mx-1 px-1">
                    {sessions.map((session) => {
                        const isActive = activeSessionId === session.id;
                        return (
                            <button
                                key={session.id}
                                onClick={() => onSessionChange(session.id)}
                                className={`
                                    flex-1 px-2 py-2.5 rounded-xl border transition-all flex flex-col items-center justify-center min-w-[60px]
                                    ${isActive 
                                        ? 'bg-ios-indigo text-white border-ios-indigo shadow-md shadow-indigo-200' 
                                        : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                                    }
                                `}
                            >
                                <span className={`text-xs font-bold leading-none mb-1 ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                                    {session.name}
                                </span>
                                <span className="text-sm font-black leading-none">
                                    {session.start_time?.substring(0, 5)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white rounded-2xl p-4 border border-dashed border-gray-200 text-center">
                    <p className="text-xs font-bold text-gray-400 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        등록된 운영 시간이 없습니다.
                    </p>
                </div>
            ))}
        </div>
    );
};

export default DateSessionSelector;

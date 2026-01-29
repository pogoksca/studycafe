import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BookOpen, Award, Trees as Tree, Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';

const UserProfile = ({ user }) => {
  const [studyPlan, setStudyPlan] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);

  // Mock attendance data for visual calendar
  const mockAttendance = [
    { date: '2026-01-20', status: 'present' },
    { date: '2026-01-21', status: 'present' },
    { date: '2026-01-22', status: 'late' },
    { date: '2026-01-23', status: 'absent' },
  ];

  const handleSavePlan = async () => {
    setLoading(true);
    // TODO: Supabase integration for study plans
    setTimeout(() => {
      alert('Your study plan has been synchronized.');
      setLoading(false);
    }, 1000);
  };

  const currentMonthDays = eachDayOfInterval({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 animate-spring-up overflow-visible">
      {/* Left: Study Plan & Stats */}
      <div className="xl:col-span-2 space-y-10">
        <div className="ios-glass rounded-ios p-8 lg:p-12 space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-ios-indigo/5 blur-3xl -z-10" />
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ios-indigo to-ios-blue text-white flex items-center justify-center shadow-xl shadow-ios-indigo/20">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">오늘의 학습 목표</h3>
              <p className="text-ios-gray font-medium">나만의 학습 계획을 세우고 실천하세요.</p>
            </div>
          </div>
          
          <textarea 
            value={studyPlan}
            onChange={(e) => setStudyPlan(e.target.value)}
            placeholder="오늘의 목표를 입력하세요... (예: 수능 특강 수학 50문제 풀기)"
            className="w-full h-48 bg-white/5 border border-white/10 rounded-3xl p-8 text-[15px] focus:ring-2 focus:ring-ios-indigo focus:bg-white/10 transition-all resize-none font-bold placeholder:text-ios-gray/50 leading-relaxed"
          />
          
          <button 
            onClick={handleSavePlan}
            disabled={loading}
            className="w-full py-5 bg-white text-black rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl flex items-center justify-center gap-3 ios-tap"
          >
            {loading ? <Clock className="w-5 h-5 animate-spin" /> : <Tree className="w-5 h-5" />}
            {loading ? '동기화 중...' : '학습 목표 저장 및 게시'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {[
             { label: '연속 학습일', value: '12일', icon: Award, color: 'text-ios-amber', bg: 'bg-ios-amber/10' },
             { label: '출석률', value: '98%', icon: CheckCircle2, color: 'text-ios-emerald', bg: 'bg-ios-emerald/10' },
             { label: '지각 횟수', value: '1회', icon: AlertTriangle, color: 'text-ios-rose', bg: 'bg-ios-rose/10' },
           ].map((stat, i) => (
             <div key={i} className="ios-glass rounded-[2rem] p-8 flex flex-col items-center text-center gap-5 group hover:bg-white/10 transition-all duration-500 ios-tap">
               <div className={`w-16 h-16 rounded-[1.5rem] ${stat.bg} ${stat.color} flex items-center justify-center shadow-inner-white group-hover:scale-110 transition-transform`}>
                 <stat.icon className="w-8 h-8" />
               </div>
               <div>
                 <p className="text-[11px] uppercase font-black text-ios-gray tracking-widest mb-1">{stat.label}</p>
                 <p className="text-3xl font-black text-white">{stat.value}</p>
               </div>
             </div>
           ))}
        </div>
      </div>

      {/* Right: Attendance Calendar */}
      <div className="space-y-10">
        <div className="ios-glass rounded-ios p-10 border-white/5 shadow-inner-white">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ios-indigo/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-ios-indigo" />
              </div>
              학습 활동 리포트
            </h3>
          </div>

          <div className="grid grid-cols-7 gap-3 text-center mb-6">
            {['일','월','화','수','목','금','토'].map((d, i) => (
              <span key={i} className="text-[11px] font-black text-ios-gray uppercase tracking-widest">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {currentMonthDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const attend = mockAttendance.find(a => a.date === dateStr);
              const isSelected = isToday(day);
              
              return (
                <div 
                   key={idx}
                   className={`aspect-square rounded-2xl flex items-center justify-center text-[12px] font-black transition-all duration-500 ios-tap relative group ${
                    isSelected ? 'bg-white text-black shadow-2xl scale-[1.15] z-10' :
                    attend?.status === 'present' ? 'bg-ios-emerald/20 text-ios-emerald' :
                    attend?.status === 'late' ? 'bg-ios-amber/20 text-ios-amber' :
                    attend?.status === 'absent' ? 'bg-ios-rose/20 text-ios-rose' :
                    'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {format(day, 'd')}
                  {attend && !isSelected && (
                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${
                      attend.status === 'present' ? 'bg-ios-emerald' :
                      attend.status === 'late' ? 'bg-ios-amber' : 'bg-ios-rose'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-10 pt-8 border-t border-white/10">
             <div className="flex flex-col gap-4">
                <span className="text-[11px] font-black text-ios-gray uppercase tracking-[0.2em]">활동 지표</span>
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: '출석', color: 'bg-ios-emerald' },
                    { label: '지각', color: 'bg-ios-amber' },
                    { label: '결석', color: 'bg-ios-rose' }
                  ].map(leg => (
                    <div key={leg.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                      <span className={`w-2 h-2 rounded-full ${leg.color} shadow-lg`}></span>
                      <span className="text-[11px] font-black text-white/70">{leg.label}</span>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-ios-indigo via-[#7D7AFF] to-[#9B99FF] rounded-ios p-10 text-white shadow-2xl shadow-ios-indigo/30 relative overflow-hidden group ios-tap">
           <div className="relative z-10">
             <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-6 shadow-inner-white">
               <Award className="w-8 h-8 text-white" />
             </div>
             <h4 className="text-2xl font-black tracking-tight mb-2">엘리트 멤버</h4>
             <p className="text-[15px] text-white/80 font-medium mb-8 leading-relaxed">상위 5% 학습 달성자입니다.<br/>명예의 전당 배지가 활성화되었습니다.</p>
             <button className="w-full py-4 bg-black/20 hover:bg-black/40 rounded-2xl text-xs font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10">순위표 보기</button>
           </div>
           <div className="absolute -right-16 -top-16 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-[2000ms]"></div>
           <div className="absolute left-[-10%] bottom-[-10%] w-40 h-40 bg-white/5 rounded-full blur-2xl group-hover:translate-x-10 transition-transform duration-[2000ms]"></div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;

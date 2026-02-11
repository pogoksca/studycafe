import { useState, useEffect } from 'react'
import { Layout, Calendar, User, Settings, LogOut, Search, MapPin, ShieldCheck, Map, Users, RefreshCw, Printer, Box } from 'lucide-react'
import FloorPlanEditor from './components/admin/FloorPlanEditor'
import AttendanceManager from './components/admin/AttendanceManager'
import SafetySupervision from './components/admin/SafetySupervision'
import TeacherMobileView from './components/teacher/TeacherMobileView'
import StudentMobileView from './components/student/StudentMobileView'
import SeatBookingMap from './components/booking/SeatBookingMap'
import AttendanceCheck from './components/booking/AttendanceCheck'
import BookingWizard from './components/booking/BookingWizard'
import UserProfile from './components/profile/UserProfile'
import StudentManagement from './components/admin/StudentManagement'
import CustomLogin from './components/auth/CustomLogin'
import ParentMobileView from './components/parent/ParentMobileView'
import OperationManager from './components/admin/OperationManager'
import SystemSettings from './components/admin/SystemSettings'
import AttendancePrint from './components/admin/AttendancePrint'
import ZoneManagement from './components/admin/ZoneManagement'
import ZoneGradeManager from './components/admin/ZoneGradeManager'
import SeatMapModal from './components/booking/SeatMapModal'
import SeatManualSelectionModal from './components/booking/SeatManualSelectionModal'
import { supabase } from './lib/supabase'
import { format, parseISO } from 'date-fns'


function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab) return savedTab;
    
    // Check initial user from sessionStorage to decide default landing page
    const savedUserStr = sessionStorage.getItem('currentUser');
    if (savedUserStr) {
      try {
        const user = JSON.parse(savedUserStr);
        if (['admin', 'teacher'].includes(user.role)) return 'admin';
      } catch (e) {
        console.error('Failed to parse saved user', e);
      }
    }
    return 'map';
  })
  const [adminSubTab, setAdminSubTab] = useState(() => {
    return sessionStorage.getItem('adminSubTab') || 'attendance';
  })
  const [selectedSeat, setSelectedSeat] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = sessionStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  })
  const [viewDate, setViewDate] = useState(format(new Date(), 'yyyy-MM-dd')); // Global date state for seat map
  const [selectedZoneId, setSelectedZoneId] = useState(null); // Global state for current zone
  const [schoolInfo, setSchoolInfo] = useState(() => {
    const saved = sessionStorage.getItem('schoolInfo');
    return saved ? JSON.parse(saved) : { name: 'POGOK', name_en: 'POGOK', level: '고등학교' };
  });
  
  // Proxy Search State (Global)
  const [proxySearchQuery, setProxySearchQuery] = useState('');
  const [proxySearchResults, setProxySearchResults] = useState([]);
  const [selectedProxyUser, setSelectedProxyUser] = useState(null);
  const [isProxySearching, setIsProxySearching] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(() => {
    return window.innerWidth < 768 && window.innerHeight > window.innerWidth;
  });
  const [isSeatModalOpen, setIsSeatModalOpen] = useState(false);
  const [isManualSeatModalOpen, setIsManualSeatModalOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobilePortrait(window.innerWidth < 768 && window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Search
  const handleProxySearch = async (queryInput) => {
    const query = queryInput.trim();
    if (!query) return;

    setIsProxySearching(true);
    let combinedResults = [];
    
    try {
      // User confirmed 'profiles_student' is the correct table
      const { data, error } = await supabase
        .from('profiles_student')
        .select('*')
        .or(`full_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(50);

      if (error) {
         console.error('[Search Error]', error);
      } else if (data) {
         // Map results to the expected format
         combinedResults = data.map(item => ({
            id: item.id,
            full_name: item.full_name,
            username: item.username,
            grade: item.grade || 0,
            class_number: item.class_number || 0,
            student_number: item.student_number || 0,
            role: 'student'
         }));
      }

      setProxySearchResults(combinedResults);
    } catch (err) {
      console.error('Search Error:', err);
      setProxySearchResults([]);
    } finally {
      setIsProxySearching(false);
    }
  };

  useEffect(() => {
    const fetchSchoolInfo = async () => {
      const { data } = await supabase
        .from('configs')
        .select('value')
        .eq('key', 'school_info')
        .single();
      if (data?.value) {
        setSchoolInfo(data.value);
        sessionStorage.setItem('schoolInfo', JSON.stringify(data.value));
      }
    };
    fetchSchoolInfo();
  }, []);

  // Persist session to sessionStorage
  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      sessionStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  useEffect(() => {
    sessionStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('adminSubTab', adminSubTab);
  }, [adminSubTab]);

  // Cleanup legacy localStorage entries
  useEffect(() => {
    const legacyKeys = ['currentUser', 'activeTab', 'adminSubTab', 'schoolInfo', 'schoolName'];
    legacyKeys.forEach(key => localStorage.removeItem(key));
  }, []);


  const handleZoneChange = (zoneId) => {
    setSelectedZoneId(zoneId);
    setSelectedSeat(null); // Explicitly clear seat on zone change
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('activeTab');
    sessionStorage.removeItem('adminSubTab');
    setActiveTab('map');
  };

  if (!currentUser) {
    return <CustomLogin onLoginSuccess={(user) => {
      setCurrentUser(user);
      // Automatically switch to Admin tab for staff on login
      if (['admin', 'teacher'].includes(user.role)) {
        setActiveTab('admin');
      }
    }} />
  }

  // Define Menu Items by Role
  // Define Menu Items by Role - Swapped 'admin' and 'map' order
  const mainNavItems = [
    { id: 'admin', icon: Settings, label: '관리자/교사용 도구', roles: ['admin', 'teacher'] },
    { id: 'map', icon: Layout, label: '예약하기', roles: ['admin', 'student', 'parent', 'teacher'] },
    { id: 'attendance', icon: MapPin, label: '출석 인증', roles: ['student'] },
    { id: 'profile', icon: User, label: '나의 학습 현황', roles: ['student', 'parent'] },
  ].filter(item => !item.roles || item.roles.includes(currentUser.role));

  const staffMenuGroups = [
    {
      group: '현장 모니터링',
      items: [
        { id: 'attendance', label: '실시간 출석 현황', icon: Search, roles: ['admin', 'teacher'] },
        { id: 'attendance_print', label: '출석부 출력', icon: Printer, roles: ['admin', 'teacher'] },
        { id: 'safety', label: '안전 관리/감독', icon: ShieldCheck, roles: ['admin', 'teacher'] },
      ]
    },
    {
      group: '공간 및 자원 관리',
      items: [
        { id: 'zones', label: '학습 공간 관리', icon: Box, roles: ['admin'] },
        { id: 'layout', label: '공간 배치 편집', icon: Map, roles: ['admin'] },
        { id: 'zone_grades', label: '구역별 학년 지정', icon: ShieldCheck, roles: ['admin'] },
        { id: 'students', label: '학생 명단 관리', icon: Users, roles: ['admin'] },
        { id: 'schedule', label: '운영 일정 설정', icon: Calendar, roles: ['admin'] },
      ]
    },
    {
      group: '시스템 설정',
      items: [
        { id: 'settings', label: '환경 설정', icon: Settings, roles: ['admin'] },
      ]
    }
  ].map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes(currentUser.role))
  })).filter(group => group.items.length > 0);

  const isStaff = ['admin', 'teacher'].includes(currentUser.role);
  const shouldShowMobileView = currentUser.role === 'teacher' || (currentUser.role === 'admin' && isMobilePortrait);

  if (shouldShowMobileView) {
    return <TeacherMobileView onLogout={handleLogout} currentUser={currentUser} />;
  }

  if (currentUser.role === 'student') {
    return <StudentMobileView onLogout={handleLogout} currentUser={currentUser} />;
  }

  if (currentUser.role === 'parent') {
    return <ParentMobileView onLogout={handleLogout} currentUser={currentUser} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F2F2F7] text-[#1C1C1E] overflow-hidden font-sans selection:bg-ios-indigo/10">
      {/* Top Header - Unified Glass Material */}
      <header className="glass-header px-4 py-2.5 lg:px-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          {/* Logo - Refined Branding */}
          <div className="flex items-center gap-3 group cursor-default">
            <div className="w-9 h-9 rounded-apple-md bg-[#1C1C1E] flex items-center justify-center shadow-lg shadow-black/5 group-hover:scale-105 transition-transform">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-none text-[#1C1C1E]">{schoolInfo.name_en || 'GOE'}</h1>
              <p className="text-[9px] font-black text-ios-indigo tracking-widest uppercase opacity-60 mt-1">Study Cafe</p>
            </div>
          </div>

          {/* Navigation Tabs - Glass Control Group */}
          <nav className="flex items-center gap-1 bg-gray-200/20 backdrop-blur-2xl p-1 rounded-apple-md border border-white/40 ml-4">
            {mainNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-apple-md transition-all duration-300 ios-tap group relative ${
                  activeTab === item.id 
                    ? 'bg-white shadow-sm text-[#1C1C1E]' 
                    : 'text-[#1C1C1E]/50 hover:text-[#1C1C1E] hover:bg-white/40'
                }`}
              >
                <item.icon className={`w-4 h-4 transition-all duration-300 ${activeTab === item.id ? 'text-ios-indigo' : 'group-hover:scale-110'}`} />
                <span className="font-black text-[13px]">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Proxy Booking Search Bar (Admin/Teacher Only - Visible when Booking Tab is active) */}
          {activeTab === 'map' && ['admin', 'teacher'].includes(currentUser.role) && (
             <div className="relative ml-4 z-50">
               {selectedProxyUser ? (
                 // Selected State UI
                 <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-[12px] border-2 border-ios-indigo/20 shadow-sm animate-fade-in-scale">
                    <div className="flex items-center gap-2 pr-2 border-r border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-[10px] font-black shadow-sm border border-gray-200">
                          {selectedProxyUser.full_name[0]}
                      </div>
                      <div className="flex flex-col gap-0.5">
                          <span className="text-[12px] font-black text-[#1C1C1E]">{selectedProxyUser.full_name}</span>
                          <span className="text-[9px] text-gray-500 font-medium">대리 예약 중 ({selectedProxyUser.username})</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => {
                          setProxySearchQuery('');
                          setProxySearchResults([]);
                          setSelectedProxyUser(null);
                      }}
                      className="flex items-center gap-1.5 bg-gray-50 hover:bg-ios-rose/10 text-gray-500 hover:text-ios-rose px-2 py-1.5 rounded-[8px] transition-all group"
                    >
                      <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                      <span className="text-[10px] font-bold">다른 학생 선택</span>
                    </button>
                 </div>
               ) : (
                 // Search Input UI
                 <div className="group flex items-center gap-2 bg-gray-50/80 px-3 py-1.5 rounded-[10px] border border-gray-100 backdrop-blur-md transition-all focus-within:bg-white focus-within:shadow-md focus-within:w-72 w-56 focus-within:border-ios-indigo/50">
                   <Search className="w-3.5 h-3.5 text-gray-400 group-focus-within:text-ios-indigo transition-colors" />
                   <input 
                      type="text"
                      value={proxySearchQuery}
                      onChange={(e) => {
                        setProxySearchQuery(e.target.value);
                        if(e.target.value.length >= 1) handleProxySearch(e.target.value);
                        else setProxySearchResults([]);
                      }}
                      placeholder="학생 검색 (이름 또는 학번)"
                      className="bg-transparent border-none outline-none text-[12px] font-bold placeholder:text-gray-400 w-full text-gray-700"
                   />
                 </div>
               )}

               {/* Dropdown Results */}
               {proxySearchResults.length > 0 && !selectedProxyUser && (
                 <div className="absolute top-full left-0 mt-2 w-72 bg-white/90 backdrop-blur-xl rounded-[12px] shadow-xl border border-gray-100 overflow-hidden animate-spring-up p-1 z-50">
                   {proxySearchResults.map(s => (
                     <button
                       key={s.id}
                       onClick={() => {
                         setSelectedProxyUser(s);
                         setProxySearchQuery('');
                         setProxySearchResults([]);
                       }}
                       className="w-full text-left px-3 py-2.5 hover:bg-ios-indigo/5 rounded-[8px] transition-colors flex items-center justify-between group border-b border-gray-50 last:border-0"
                     >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-[8px] bg-gray-100 group-hover:bg-white group-hover:shadow-sm flex items-center justify-center text-[10px] font-bold text-gray-500 group-hover:text-ios-indigo transition-all">
                            {s.full_name[0]}
                          </div>
                          <div>
                            <div className="text-[13px] font-bold text-[#1C1C1E] group-hover:text-ios-indigo transition-colors">{s.full_name}</div>
                            <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                              {s.grade > 0 && <span>{s.grade}학년 {s.class_number}반 {s.student_number}번</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] bg-gray-50 text-gray-400 px-2 py-1 rounded-[6px] group-hover:bg-ios-indigo group-hover:text-white transition-colors font-bold">
                          선택
                        </div>
                     </button>
                   ))}
                 </div>
               )}
             </div>
          )}
        </div>

         <div className="flex items-center gap-7">
          <div className="flex items-center gap-3 bg-gray-200/20 p-1 px-4 py-2 rounded-apple-md border border-white/40 backdrop-blur-lg">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/50 border border-white flex items-center justify-center shadow-sm">
              <User className="w-4 h-4 text-ios-indigo" />
            </div>
            <div className="text-left">
              <p className="text-[13px] font-black leading-none text-[#1C1C1E] uppercase">{currentUser?.full_name}</p>
              <p className="text-[9px] font-black text-ios-indigo tracking-widest mt-1 uppercase opacity-60 italic">{currentUser?.role}</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 p-2 px-5 rounded-apple-md text-ios-gray hover:text-ios-rose hover:bg-ios-rose/5 transition-all ios-tap border border-transparent hover:border-ios-rose/10 group"
          >
            <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-bold text-[13px]">로그아웃</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 h-full flex overflow-hidden relative">
        {activeTab === 'admin' ? (
          <div className="flex-1 flex overflow-hidden w-full">
             {/* Staff Sidebar - Slim Glass Sidebar */}
            <aside className="w-64 glass-material flex flex-col p-6 shrink-0 z-30 shadow-[4px_0_40px_rgba(0,0,0,0.02)] translate-x-0">
              <div className="flex-1 space-y-9">
                {staffMenuGroups.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-4">
                    <h5 className="text-[10px] font-black text-ios-gray/60 uppercase tracking-[0.25em] px-3">{group.group}</h5>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setAdminSubTab(item.id)}
                          className={`w-full flex items-center gap-3.5 px-3 py-3 rounded-apple-md text-[13.5px] font-bold transition-all ios-tap group ${
                            adminSubTab === item.id 
                              ? 'bg-white shadow-sm text-[#1C1C1E]' 
                              : 'text-ios-gray hover:text-[#1C1C1E] hover:bg-white/40'
                          }`}
                        >
                          <item.icon className={`w-4 h-4 ${adminSubTab === item.id ? 'text-ios-indigo' : 'text-ios-gray/50 group-hover:text-ios-indigo transition-colors'}`} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Bottom Version Info */}
              <div className="pt-6 border-t border-gray-50">
                <p className="text-[8px] font-bold text-gray-300 tracking-tighter uppercase italic">Copyright murmurgene 2026. All rights reserved.</p>
              </div>
            </aside>

            {/* Admin Content View */}
            <div className="flex-1 bg-[#F2F2F7] p-6 overflow-hidden">
              <div className="h-full w-full rounded-2xl overflow-hidden shadow-sm border border-black/5 bg-white">
                {adminSubTab === 'zones' ? <ZoneManagement /> :
                 adminSubTab === 'zone_grades' ? <ZoneGradeManager /> :
                 adminSubTab === 'layout' ? <FloorPlanEditor /> : 
                 adminSubTab === 'attendance' ? <AttendanceManager /> : 
                 adminSubTab === 'attendance_print' ? <AttendancePrint /> :
                 adminSubTab === 'students' ? <StudentManagement /> :
                 adminSubTab === 'schedule' ? <OperationManager /> :
                 adminSubTab === 'settings' ? <SystemSettings /> :
                 <SafetySupervision />}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 h-full flex flex-col overflow-hidden p-6">
            {activeTab === 'attendance' ? (
              <div className="h-full flex flex-col items-center justify-center">
                <AttendanceCheck />
              </div>
            ) : activeTab === 'profile' ? (
              <div className="h-full overflow-y-auto scrollbar-hide">
                <UserProfile />
              </div>
            ) : (
               <div className="flex-1 flex flex-col overflow-hidden pt-2">
                <section className="flex-1 flex flex-col xl:flex-row gap-6 leading-normal overflow-hidden h-full">
                  {/* Map View */}
                  <div className="flex-1 flex flex-col overflow-hidden h-full">
                    <div className="flex-1 w-full glass-card overflow-hidden p-2 shadow-sm h-full">
                      <SeatBookingMap 
                        onSelectSeat={setSelectedSeat} 
                        selectedProxyUser={selectedProxyUser}
                        viewDate={viewDate}
                        onDateChange={setViewDate}
                        selectedZoneId={selectedZoneId}
                        onZoneChange={handleZoneChange}
                      />
                    </div>
                  </div>

                  {/* Sidebar / Wizard */}
                  <div className="xl:w-[340px] h-full overflow-y-auto scrollbar-hide glass-card shadow-sm">
                    <BookingWizard 
                      selectedSeat={selectedSeat} 
                      onComplete={() => setSelectedSeat(null)} 
                      targetUser={selectedProxyUser}
                      loggedInUser={currentUser}
                      initialDate={viewDate}
                      onDateChange={setViewDate}
                      currentZoneId={selectedZoneId}
                      onOpenSeatModal={() => setIsManualSeatModalOpen(true)}
                    />
                  </div>
                </section>
                                <SeatMapModal 
                    isOpen={isSeatModalOpen} 
                    onClose={() => setIsSeatModalOpen(false)} 
                    zoneId={selectedZoneId} 
                    onSelect={(seat) => { 
                      setSelectedSeat(seat); 
                      setIsSeatModalOpen(false); 
                    }} 
                    selectedDate={parseISO(viewDate)} 
                  />

                  <SeatManualSelectionModal
                    isOpen={isManualSeatModalOpen}
                    onClose={() => setIsManualSeatModalOpen(false)}
                    zoneId={selectedZoneId}
                    currentUser={selectedProxyUser || currentUser}
                    onOpenMap={() => setIsSeatModalOpen(true)}
                    onSelect={(seat) => {
                      setSelectedSeat(seat);
                      setIsManualSeatModalOpen(false);
                    }}
                  />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

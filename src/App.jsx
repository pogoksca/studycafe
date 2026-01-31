import { useState, useEffect } from 'react'
import { Layout, Calendar, User, Settings, LogOut, Search, MapPin, ShieldCheck, Map, Users, RefreshCw, Printer } from 'lucide-react'
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
import { supabase } from './lib/supabase'
import { format } from 'date-fns'


function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) return savedTab;
    
    // Check initial user from localStorage to decide default landing page
    const savedUserStr = localStorage.getItem('currentUser');
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
    return localStorage.getItem('adminSubTab') || 'attendance';
  })
  const [selectedSeat, setSelectedSeat] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  })
  const [viewDate, setViewDate] = useState(format(new Date(), 'yyyy-MM-dd')); // Global date state for seat map
  const [selectedZoneId, setSelectedZoneId] = useState(null); // Global state for current zone
  const [schoolName, setSchoolName] = useState(() => {
    return localStorage.getItem('schoolName') || 'GOE STUDY CAFE';
  });
  
  // Proxy Search State (Global)
  const [proxySearchQuery, setProxySearchQuery] = useState('');
  const [proxySearchResults, setProxySearchResults] = useState([]);
  const [selectedProxyUser, setSelectedProxyUser] = useState(null);
  const [isProxySearching, setIsProxySearching] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(() => {
    return window.innerWidth < 768 && window.innerHeight > window.innerWidth;
  });

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
      // Search in 'profiles' (Students who have already joined/signed up)
      // Reference error 23503 occurs if we use IDs from applicant_pool because bookings table references profiles.id
      let queryBuilder = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student') 
        .limit(50);

      // If exactly 3 digits, prioritize "Class Search" (Starts With)
      if (/^\d{3}$/.test(query)) {
         queryBuilder = queryBuilder.or(`username.like.${query}%,full_name.ilike.%${query}%,username.ilike.%${query}%`);
      } else {
         // General search
         queryBuilder = queryBuilder.or(`full_name.ilike.%${query}%,username.ilike.%${query}%`);
      }
      
      const { data, error } = await queryBuilder;

      if (error) {
         console.error('[Search Error]', error);
      } else {
         // Map results to the expected format
         combinedResults = data.map(item => ({
            id: item.id, // This is the real UUID from profiles table
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
      if (data) {
        setSchoolName(data.value.name);
        localStorage.setItem('schoolName', data.value.name);
      }
    };
    fetchSchoolInfo();
  }, []);

  // Persist session to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('adminSubTab', adminSubTab);
  }, [adminSubTab]);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('activeTab');
    localStorage.removeItem('adminSubTab');
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
        { id: 'layout', label: '공간 배치 편집', icon: Map, roles: ['admin'] },
        { id: 'students', label: '학생 명단 관리', icon: Users, roles: ['admin'] },
        { id: 'schedule', label: '운영 일정 설정', icon: Calendar, roles: ['admin'] },
      ]
    },
    {
      group: '시스템 설정',
      items: [
        { id: 'settings', label: '공간 및 환경 설정', icon: Settings, roles: ['admin'] },
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
    <div className="flex flex-col h-screen bg-[#F2F2F7] text-[#1C1C1E] overflow-hidden font-sans selection:bg-ios-indigo/10">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200/60 px-4 py-2 lg:px-8 flex items-center justify-between z-40 shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[6px] bg-[#1C1C1E] flex items-center justify-center shadow-lg shadow-black/10">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-tight uppercase text-[#1C1C1E]">{schoolName.split(' ')[0]}</h1>
              <p className="text-[8px] font-black tracking-[0.2em] text-ios-indigo uppercase opacity-80">{schoolName.split(' ').slice(1).join(' ') || 'Study Cafe'}</p>
            </div>
          </div>

          {/* Navigation Tabs - Horizontal */}
          <nav className="flex items-center gap-1 bg-gray-50/80 p-1 rounded-[10px] border border-gray-100 ml-4 backdrop-blur-md">
            {mainNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-[8px] transition-all duration-300 group relative ${
                  activeTab === item.id 
                    ? 'bg-white shadow-md text-[#1C1C1E]' 
                    : 'text-[#1C1C1E]/40 hover:text-[#1C1C1E] hover:bg-white/50'
                }`}
              >
                <item.icon className={`w-4 h-4 transition-transform duration-300 ${activeTab === item.id ? 'text-ios-indigo' : 'group-hover:scale-110'}`} />
                <span className="font-black text-[13px]">{item.label}</span>
                {activeTab === item.id && (
                  <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-ios-indigo" />
                )}
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
                              <span>ID: {s.username}</span>
                              {s.grade > 0 && <span className="text-gray-300">|</span>}
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

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-gray-50/50 p-1 px-4 py-1.5 rounded-[10px] border border-gray-200/30">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-gray-100 flex items-center justify-center shadow-sm">
              <User className="w-4 h-4 text-ios-indigo" />
            </div>
            <div className="text-left">
              <p className="text-[13px] font-black leading-none text-[#1C1C1E]">{currentUser?.full_name}</p>
              <p className="text-[9px] font-black text-ios-indigo tracking-widest mt-1 uppercase opacity-60 italic">{currentUser?.role}</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 p-2 px-4 rounded-[10px] text-ios-gray hover:text-ios-rose hover:bg-ios-rose/5 transition-all ios-tap border border-transparent hover:border-ios-rose/10 group"
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
            {/* Staff Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-100 flex flex-col p-6 shrink-0 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
              <div className="flex-1 space-y-8">
                {staffMenuGroups.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-3">
                    <h5 className="text-[10px] font-black text-ios-gray uppercase tracking-[0.2em] px-2">{group.group}</h5>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setAdminSubTab(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ios-tap group ${
                            adminSubTab === item.id 
                              ? 'bg-white text-[#1C1C1E] shadow-md border border-gray-100' 
                              : 'text-ios-gray hover:text-[#1C1C1E] hover:bg-gray-50'
                          }`}
                        >
                          <item.icon className={`w-4 h-4 ${adminSubTab === item.id ? 'text-ios-indigo' : 'group-hover:text-ios-indigo transition-colors'}`} />
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
                {adminSubTab === 'layout' ? <FloorPlanEditor /> : 
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
                <section className="flex-1 flex flex-col xl:flex-row gap-6 leading-normal overflow-hidden">
                  {/* Map View */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 w-full bg-white rounded-2xl border border-black/5 overflow-hidden p-2 shadow-sm">
                      <SeatBookingMap 
                        onSelectSeat={setSelectedSeat} 
                        selectedProxyUser={selectedProxyUser}
                        viewDate={viewDate}
                        onDateChange={setViewDate}
                        selectedZoneId={selectedZoneId}
                        onZoneChange={setSelectedZoneId}
                      />
                    </div>
                  </div>

                  {/* Sidebar / Wizard */}
                  <div className="xl:w-80 h-full overflow-y-auto scrollbar-hide bg-white rounded-2xl border border-black/5 shadow-sm">
                    <BookingWizard 
                      selectedSeat={selectedSeat} 
                      onComplete={() => setSelectedSeat(null)} 
                      targetUser={selectedProxyUser}
                      loggedInUser={currentUser}
                      initialDate={viewDate}
                      onDateChange={setViewDate}
                      currentZoneId={selectedZoneId}
                    />
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

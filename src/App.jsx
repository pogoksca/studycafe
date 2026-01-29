import { useState, useEffect } from 'react'
import { Layout, Calendar, User, Settings, LogOut, Search, MapPin } from 'lucide-react'
import FloorPlanEditor from './components/admin/FloorPlanEditor'
import AttendanceManager from './components/admin/AttendanceManager'
import SafetySupervision from './components/admin/SafetySupervision'
import SeatBookingMap from './components/booking/SeatBookingMap'
import AttendanceCheck from './components/booking/AttendanceCheck'
import BookingWizard from './components/booking/BookingWizard'
import UserProfile from './components/profile/UserProfile'
import StudentManagement from './components/admin/StudentManagement'
import CustomLogin from './components/auth/CustomLogin'
import OperationManager from './components/admin/OperationManager'
import SystemSettings from './components/admin/SystemSettings'

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'map';
  })
  const [adminSubTab, setAdminSubTab] = useState(() => {
    return localStorage.getItem('adminSubTab') || 'layout';
  })
  const [selectedSeat, setSelectedSeat] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  })

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
    return <CustomLogin onLoginSuccess={(user) => setCurrentUser(user)} />
  }

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7] text-[#1C1C1E] overflow-hidden font-sans selection:bg-ios-indigo/10">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200/60 px-4 py-2 lg:px-8 flex items-center justify-between z-30 shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[6px] bg-[#1C1C1E] flex items-center justify-center shadow-lg shadow-black/10">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-tight italic uppercase text-[#1C1C1E]">Pogok</h1>
              <p className="text-[8px] font-black tracking-[0.2em] text-ios-indigo uppercase opacity-80">Study Cafe</p>
            </div>
          </div>

          {/* Navigation Tabs - Horizontal */}
          <nav className="flex items-center gap-1 bg-gray-50 p-1 rounded-[8px] border border-gray-100 ml-4">
            {[
              { id: 'map', icon: Layout, label: '예약하기', roles: ['admin', 'student', 'parent', 'teacher'] },
              { id: 'attendance', icon: MapPin, label: '출석 인증', roles: ['student'] },
              { id: 'calendar', icon: Calendar, label: '학습 스케줄', roles: ['admin', 'student', 'parent', 'teacher'] },
              { id: 'profile', icon: User, label: '나의 학습 현황', roles: ['student', 'parent'] },
              { id: 'admin', icon: Settings, label: '관리자 도구', roles: ['admin', 'teacher'] },
            ].filter(item => !item.roles || item.roles.includes(currentUser.role)).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] transition-all duration-200 group ${
                  activeTab === item.id 
                    ? 'bg-white shadow-sm border border-gray-100 text-[#1C1C1E]' 
                    : 'text-[#1C1C1E]/50 hover:text-[#1C1C1E] hover:bg-white/50'
                }`}
              >
                <item.icon className={`w-3.5 h-3.5 ${activeTab === item.id ? 'text-ios-indigo' : 'group-hover:text-ios-indigo'}`} />
                <span className="font-bold text-[13px]">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-gray-50/50 p-1 px-3 rounded-[6px] border border-gray-200/30">
            <div className="w-8 h-8 rounded-[6px] overflow-hidden bg-white border border-gray-100 flex items-center justify-center">
              <User className="w-4 h-4 text-[#1C1C1E]" />
            </div>
            <div className="text-left">
              <p className="text-[13px] font-black leading-none text-[#1C1C1E]">{currentUser?.full_name}</p>
              <p className="text-[9px] font-black text-ios-indigo tracking-widest mt-1 uppercase opacity-70">{currentUser?.role}</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 p-2 px-3 rounded-[6px] text-ios-rose hover:bg-ios-rose/5 transition-all ios-tap border border-transparent hover:border-ios-rose/20"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-bold text-[13px]">로그아웃</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 h-full flex flex-col overflow-hidden relative p-4 lg:p-6">
        <div className="flex-1 min-h-0 flex flex-col">
          {activeTab === 'admin' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-4 mb-6 pt-2 shrink-0">
                {[
                  { id: 'layout', label: '공간 배치', roles: ['admin'] },
                  { id: 'attendance', label: '출석 현황', roles: ['admin', 'teacher'] },
                  { id: 'safety', label: '안전 관리', roles: ['admin', 'teacher'] },
                   { id: 'students', label: '학생 관리', roles: ['admin'] },
                  { id: 'schedule', label: '운영 일정', roles: ['admin'] },
                  { id: 'settings', label: '시스템 설정', roles: ['admin'] },
                ].filter(tab => !tab.roles || (currentUser && tab.roles.includes(currentUser.role))).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAdminSubTab(tab.id)}
                    className={`px-6 py-2 rounded-[6px] text-xs font-black transition-all duration-300 ios-tap ${
                      adminSubTab === tab.id 
                        ? 'bg-[#1C1C1E] text-white shadow-md' 
                        : 'text-ios-gray hover:text-[#1C1C1E]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              <div className="flex-1 w-full overflow-hidden">
                {adminSubTab === 'layout' ? <FloorPlanEditor /> : 
                 adminSubTab === 'attendance' ? <AttendanceManager /> : 
                 adminSubTab === 'students' ? <StudentManagement /> :
                 adminSubTab === 'schedule' ? <OperationManager /> :
                 adminSubTab === 'settings' ? <SystemSettings /> :
                 <div className="bg-white rounded-t-[6px] rounded-b-none p-2.5 pb-0 h-full"><SafetySupervision /></div>}
              </div>
            </div>
          ) : activeTab === 'attendance' ? (
            <div className="h-full flex flex-col items-center justify-center">
              <AttendanceCheck />
            </div>
          ) : activeTab === 'profile' ? (
            <div className="h-full overflow-y-auto scrollbar-hide">
              <UserProfile />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top Instruction Banner - Now outside columns to allow vertical alignment */}


              <section className="flex-1 flex flex-col xl:flex-row gap-6 leading-normal overflow-hidden">
                {/* Map View */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 w-full bg-white rounded-t-[6px] rounded-b-none border-0 overflow-hidden p-2.5 pb-0">
                    <SeatBookingMap onSelectSeat={(seat) => setSelectedSeat(seat)} />
                  </div>
                </div>

                {/* Sidebar / Wizard */}
                <div className="xl:w-80 h-full overflow-y-auto scrollbar-hide">
                  {selectedSeat ? (
                    <BookingWizard 
                      selectedSeat={selectedSeat} 
                      onComplete={() => setSelectedSeat(null)} 
                    />
                  ) : (
                    <div className="h-full bg-white rounded-t-[6px] rounded-b-none p-10 text-center space-y-6 flex flex-col justify-center">
                      <div className="w-16 h-16 rounded-[6px] bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto text-ios-indigo shadow-inner">
                        <Search className="w-6 h-6" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-black tracking-tight text-[#1C1C1E]">예약 방법</h3>
                        <p className="text-ios-gray text-xs leading-relaxed px-4">좌석 배치도에서 원하는 자리를 터치하여 예약을 시작해 주세요.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

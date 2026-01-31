import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layout, User, Lock, Phone, AlertCircle, CheckCircle2, ArrowRight, Loader2, ShieldCheck, ClipboardCheck, GraduationCap, Users as UsersIcon, Briefcase } from 'lucide-react';

const CustomLogin = ({ onLoginSuccess }) => {
    const [role, setRole] = useState('student'); // student, parent, teacher
    const [step, setStep] = useState('login'); // login, pledge, pending, rejected, challenge, success
    const [formData, setFormData] = useState({ 
        name: '', 
        studentId: '', 
        phone: '',
        password: '', // For teacher/admin
        pledgeAccepted: false,
        privacyAccepted: false
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [applicantData, setApplicantData] = useState(null);

    const [schoolName, setSchoolName] = useState(() => {
        return localStorage.getItem('schoolName') || 'GOE';
    });

    useEffect(() => {
        const fetchSchoolInfo = async () => {
            const { data } = await supabase
                .from('configs')
                .select('value')
                .eq('key', 'school_info')
                .single();
            if (data && data.value.name) {
                const name = data.value.name.split(' ')[0];
                setSchoolName(name);
                localStorage.setItem('schoolName', data.value.name);
            }
        };
        fetchSchoolInfo();
    }, []);

    const resetError = () => setError('');
    
    const autoHyphen = (value) => {
        return value
            .replace(/[^0-9]/g, '')
            .replace(/^(\d{0,3})(\d{0,4})(\d{0,4})$/g, "$1-$2-$3")
            .replace(/(-{1,2})$/g, "");
    };

    const handleRoleChange = (newRole) => {
        setRole(newRole);
        setStep('login');
        setFormData({ ...formData, name: '', studentId: '', phone: '', password: '' });
        resetError();
    };

    const handleInitialSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (role === 'teacher') {
            await handleTeacherLogin();
        } else {
            await handleStudentParentLogin();
        }
        setLoading(false);
    };

    // 1. Teacher/Admin Login Logic
    const handleTeacherLogin = async () => {
        const email = `${formData.name}@goe.edu`;
        const { data, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password: formData.password
        });

        if (authError) {
            setError('아이디 또는 비밀번호가 일치하지 않습니다.');
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        if (profile) {
            onLoginSuccess({ ...profile, full_name: profile.full_name || formData.name });
        } else {
            setError('프로필 정보를 찾을 수 없습니다.');
        }
    };

    // 2. Student/Parent Logic
    const handleStudentParentLogin = async () => {
        const { data: applicant, error: fetchError } = await supabase
            .from('applicant_pool')
            .select('*')
            .eq('name', formData.name)
            .eq('student_id', formData.studentId)
            .maybeSingle();

        if (fetchError || !applicant) {
            setError('등록되지 않은 정보이거나 이름/학번이 일치하지 않습니다.');
            return;
        }

        setApplicantData(applicant);

        // Logic for Parent
        if (role === 'parent') {
            if (!applicant.phone_number || !applicant.pledge_accepted) {
                setError('학생이 아직 사용 신청을 하지 않았습니다.');
                return;
            }
        }

        // Check Status
        if (applicant.status === 'applied') {
            // Un-pledged student
            setFormData(prev => ({ 
                ...prev, 
                phone: '', 
                pledgeAccepted: false, 
                privacyAccepted: false 
            }));
            setStep('pledge');
        } else if (applicant.status === 'pending') {
            setStep('pending');
        } else if (applicant.status === 'rejected') {
            setRejectionReason(applicant.rejection_reason || '다시 신청하기 전, 담당 선생님을 찾아오세요.');
            setStep('rejected');
        } else if (applicant.status === 'approved') {
            // Move to phone challenge
            setStep('challenge');
        }
    };

    // 3. Pledge Submission Logic
    const handlePledgeSubmit = async (e) => {
        e.preventDefault();
        if (!formData.pledgeAccepted || !formData.privacyAccepted) {
            setError('모든 필수 약관에 동의해 주세요.');
            return;
        }
        if (formData.phone.length < 10) {
            setError('올바른 전화번호를 입력해 주세요.');
            return;
        }

        setLoading(true);
        const { error: updateError } = await supabase
            .from('applicant_pool')
            .update({ 
                phone_number: formData.phone,
                pledge_accepted: true,
                privacy_accepted: true,
                pledged_at: new Date().toISOString(),
                status: 'pending'
            })
            .eq('id', applicantData.id);

        if (updateError) {
            setError('신청 처리 중 오류가 발생했습니다.');
        } else {
            setStep('pending');
        }
        setLoading(false);
    };

    // 4. Phone Challenge Verification
    const handleChallengeVerify = async (e) => {
        e.preventDefault();
        if (formData.phone === applicantData.phone_number) {
            onLoginSuccess({ 
                ...applicantData, 
                full_name: applicantData.name 
            });
        } else {
            setError('입력하신 전화번호가 등록된 정보와 일치하지 않습니다.');
        }
    };

    return (
        <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl shadow-ios-indigo/10 overflow-hidden animate-spring-up border border-gray-100">
                {/* Visual Header */}
                <div className="bg-white p-10 text-[#1C1C1E] relative overflow-hidden border-b border-gray-100">
                    <div className="relative z-10 space-y-2">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-6 border border-gray-100 shadow-sm overflow-hidden">
                            <Layout className="w-7 h-7 text-ios-indigo" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter italic leading-none">{schoolName}</h1>
                        <p className="text-[10px] font-black tracking-[0.3em] uppercase text-ios-indigo">Study Cafe System</p>
                    </div>
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-ios-indigo/5 rounded-full blur-3xl" />
                </div>

                <div className="p-8 space-y-8">
                    {/* Role Selection Tabs */}
                    {step === 'login' && (
                        <div className="flex bg-gray-50 p-1.5 rounded-2xl gap-1">
                            {[
                                { id: 'student', label: '학생', icon: GraduationCap },
                                { id: 'parent', label: '학부모', icon: UsersIcon },
                                { id: 'teacher', label: '교사', icon: Briefcase },
                            ].map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => handleRoleChange(r.id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
                                        role === r.id 
                                            ? 'bg-white text-ios-indigo shadow-md' 
                                            : 'text-ios-gray hover:text-[#1C1C1E]'
                                    }`}
                                >
                                    <r.icon className={`w-3.5 h-3.5 ${role === r.id ? 'text-ios-indigo' : 'text-ios-gray'}`} />
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {step === 'login' && (
                        <form onSubmit={handleInitialSubmit} className="space-y-6">
                            <div className="space-y-4">
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray group-focus-within:text-ios-indigo transition-colors" />
                                    <input 
                                        required
                                        type="text" 
                                        placeholder={role === 'teacher' ? "아이디 (ID)" : "이름 (ID)"}
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none"
                                    />
                                </div>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray group-focus-within:text-ios-indigo transition-colors" />
                                    <input 
                                        required
                                        type={role === 'teacher' ? "password" : "text"}
                                        placeholder={role === 'teacher' ? "비밀번호 (PW)" : "학번 5자리 (PW)"}
                                        maxLength={role === 'teacher' ? undefined : 5}
                                        value={role === 'teacher' ? formData.password : formData.studentId}
                                        onChange={(e) => setFormData(role === 'teacher' ? {...formData, password: e.target.value} : {...formData, studentId: e.target.value})}
                                        className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-ios-rose bg-ios-rose/5 p-4 rounded-xl animate-shake">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p className="text-[11px] font-black">{error}</p>
                                </div>
                            )}

                            <button 
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-white text-[#1C1C1E] border border-gray-100 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gray-200/50 ios-tap disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>로그인 <ArrowRight className="w-4 h-4" /></>}
                            </button>
                        </form>
                    )}

                    {step === 'pledge' && (
                        <form onSubmit={handlePledgeSubmit} className="space-y-6 animate-spring-up">
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight text-center">스터디카페 사용 신청</h2>
                                <p className="text-[11px] text-ios-gray text-center font-bold">이용을 위해 다음 서약서 내용을 확인해 주세요.</p>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 max-h-48 overflow-y-auto space-y-4 text-[11px] font-bold text-ios-gray leading-relaxed border border-gray-100">
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[행동 지침 및 주의 사항]</p>
                                    <p>1. 학습실 내에서는 절대 정숙하며 타인에게 방해가 되는 행동을 하지 않습니다.</p>
                                    <p>2. 지정된 좌석 외에 무단으로 자리를 점유하지 않습니다.</p>
                                    <p>3. 시설물을 청결히 사용하며 파손 시 책임을 집니다.</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[개인정보 활용 동의]</p>
                                    <p>서비스 제공을 위해 휴대폰 번호를 수집하며, 이는 로그인 신원 확인 용도로만 사용됩니다.</p>
                                    <p>수집된 개인정보는 본 학년도의 청람재 운영 종료 후 자동 파기됩니다.</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="relative group">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray group-focus-within:text-ios-indigo transition-colors" />
                                    <input 
                                        required
                                        type="tel" 
                                        autoComplete="off"
                                        placeholder="본인 휴대폰 번호 (자동 하이픈)"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: autoHyphen(e.target.value)})}
                                        className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none"
                                    />
                                </div>

                                <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.pledgeAccepted}
                                        onChange={(e) => setFormData({...formData, pledgeAccepted: e.target.checked})}
                                        className="mt-0.5"
                                    />
                                    <span className="text-[11px] font-black text-[#1C1C1E]">행동 지침 및 서약 사항을 확인했습니다. (필수)</span>
                                </label>
                                <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.privacyAccepted}
                                        onChange={(e) => setFormData({...formData, privacyAccepted: e.target.checked})}
                                        className="mt-0.5"
                                    />
                                    <span className="text-[11px] font-black text-[#1C1C1E]">개인정보 수집 및 활용에 동의합니다. (필수)</span>
                                </label>
                            </div>

                            {error && (
                                <div className="text-ios-rose text-[11px] font-black text-center">{error}</div>
                            )}

                            <div className="flex gap-2">
                                <button 
                                    type="button"
                                    onClick={() => setStep('login')}
                                    className="flex-1 py-4 bg-gray-100 text-ios-gray rounded-2xl font-black text-sm ios-tap"
                                >
                                    취소
                                </button>
                                <button 
                                    type="submit"
                                    disabled={loading}
                                    className="flex-[2] py-4 bg-white text-[#1C1C1E] border border-gray-100 rounded-2xl font-black text-sm shadow-xl shadow-gray-200/50 ios-tap"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '서약 및 신청 완료'}
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 'pending' && (
                        <div className="text-center space-y-6 py-4 animate-spring-up">
                            <div className="w-20 h-20 rounded-[2rem] bg-ios-amber/10 flex items-center justify-center mx-auto mb-2 border border-ios-amber/20 shadow-inner">
                                <Loader2 className="w-10 h-10 text-ios-amber animate-spin" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight">승인 대기 중</h2>
                                <p className="text-xs text-ios-gray font-medium leading-relaxed px-4">
                                    사용 신청이 정상적으로 접수되었습니다. 관리자 승인 완료 후 이용이 가능합니다.
                                </p>
                            </div>
                            <button onClick={() => setStep('login')} className="text-xs font-black text-ios-indigo uppercase tracking-widest">돌아가기</button>
                        </div>
                    )}

                    {step === 'rejected' && (
                        <div className="text-center space-y-6 py-4 animate-spring-up">
                            <div className="w-20 h-20 rounded-[2rem] bg-ios-rose/10 flex items-center justify-center mx-auto mb-2 border border-ios-rose/20 shadow-inner">
                                <AlertCircle className="w-10 h-10 text-ios-rose" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight">신청 거절됨</h2>
                                <div className="bg-ios-rose/5 p-4 rounded-xl mt-4 max-w-[280px] mx-auto text-left">
                                    <p className="text-[9px] font-black text-ios-rose/70 uppercase mb-1 tracking-widest">사유</p>
                                    <p className="text-[11px] font-bold text-ios-rose leading-relaxed">{rejectionReason}</p>
                                </div>
                            </div>
                            <button onClick={() => setStep('login')} className="w-full py-4 bg-white text-[#1C1C1E] border border-gray-100 rounded-2xl font-black text-xs shadow-xl shadow-gray-200/50 ios-tap uppercase tracking-widest">다시 신청하기</button>
                        </div>
                    )}

                    {step === 'challenge' && (
                        <form onSubmit={handleChallengeVerify} className="space-y-6 animate-spring-up">
                            <div className="text-center space-y-4">
                                <div className="w-20 h-20 rounded-[2rem] bg-ios-emerald/10 flex items-center justify-center mx-auto border border-ios-emerald/20 shadow-inner">
                                    <ShieldCheck className="w-10 h-10 text-ios-emerald" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight">본인 확인</h2>
                                    <p className="text-[11px] text-ios-gray font-bold">등록된 전화번호를 입력해 주세요.</p>
                                </div>
                            </div>

                            <div className="relative group">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray group-focus-within:text-ios-indigo transition-colors" />
                                <input 
                                    required
                                    type="tel" 
                                    placeholder="등록된 휴대폰 번호"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({...formData, phone: autoHyphen(e.target.value)})}
                                    className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none"
                                />
                            </div>

                            {error && (
                                <div className="text-ios-rose text-[11px] font-black text-center animate-shake">{error}</div>
                            )}

                            <button 
                                type="submit"
                                className="w-full py-4 bg-white text-[#1C1C1E] border border-gray-100 rounded-2xl font-black text-sm shadow-xl shadow-gray-200/50 ios-tap"
                            >
                                본인 확인 완료
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomLogin;

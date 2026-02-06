import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Layout, User, Lock, Phone, AlertCircle, CheckCircle2, ArrowRight, Loader2, ShieldCheck, ClipboardCheck, GraduationCap, Users as UsersIcon, Briefcase, Eraser, PenTool } from 'lucide-react';

const InlineSignaturePad = forwardRef(({ penColor = '#1C1C1E' }, ref) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [mousePos, setMousePos] = useState(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = penColor;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
    }, [penColor]);

    useImperativeHandle(ref, () => ({
        clear: () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        },
        getCanvas: () => canvasRef.current,
        isEmpty: () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const pixelBuffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
            return !pixelBuffer.some(color => color !== 0);
        }
    }));

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
        const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e) => {
        setIsDrawing(true);
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.strokeStyle = penColor;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        const pos = getPos(e);
        if (!e.touches) setMousePos(pos);
        
        if (!isDrawing) return;
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    return (
        <div 
            className="w-full h-full relative cursor-none group"
            onMouseEnter={() => !isDrawing && setMousePos(null)}
            onMouseLeave={() => setMousePos(null)}
        >
            <canvas
                ref={canvasRef}
                onMouseDown={start}
                onMouseMove={draw}
                onMouseUp={() => setIsDrawing(false)}
                onTouchStart={start}
                onTouchMove={draw}
                onTouchEnd={() => setIsDrawing(false)}
                className="w-full h-full touch-none"
            />
            {mousePos && (
                <div 
                    className="absolute pointer-events-none rounded-full border border-white/50 shadow-sm"
                    style={{
                        left: mousePos.x,
                        top: mousePos.y,
                        width: '10px',
                        height: '10px',
                        backgroundColor: penColor,
                        transform: 'translate(-50%, -50%)'
                    }}
                />
            )}
        </div>
    );
});

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

    const studentSigPad = React.useRef(null);
    const parentSigPad = React.useRef(null);

    const [schoolName, setSchoolName] = useState(() => {
        return sessionStorage.getItem('schoolName') || 'GOE';
    });

    useEffect(() => {
        const fetchSchoolInfo = async () => {
            const { data } = await supabase
                .from('configs')
                .select('value')
                .eq('key', 'school_info')
                .single();
            if (data?.value) {
                setSchoolName(data.value.name_en || 'GOE');
                sessionStorage.setItem('schoolInfo', JSON.stringify(data.value));
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

    const handleStudentParentLogin = async () => {
        const normalizedName = (formData.name || '').normalize('NFC').trim();
        const trimmedId = (formData.studentId || '').trim();

        const { data: applicant, error: fetchError } = await supabase
            .from('applicant_pool')
            .select('*')
            .eq('name', normalizedName)
            .eq('student_id', trimmedId)
            .maybeSingle();

        if (fetchError) {
            setError('서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        if (!applicant) {
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

        if (studentSigPad.current?.isEmpty() || parentSigPad.current?.isEmpty()) {
            setError('학생과 학부모 서명을 모두 완료해 주세요.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Helper to upload signature to storage
            const uploadSignature = async (sigInstance, bucket) => {
                const canvas = sigInstance.getCanvas();
                return new Promise((resolve, reject) => {
                    canvas.toBlob(async (blob) => {
                        if (!blob) {
                            reject(new Error('서명을 이미지로 변환할 수 없습니다.'));
                            return;
                        }
                        const fileName = `${applicantData.student_id}_${Date.now()}.png`;
                        const { data, error: uploadError } = await supabase.storage
                            .from(bucket)
                            .upload(fileName, blob, { contentType: 'image/png', upsert: true });

                        if (uploadError) {
                            reject(uploadError);
                        } else {
                            const { data: { publicUrl } } = supabase.storage
                                .from(bucket)
                                .getPublicUrl(fileName);
                            resolve(publicUrl);
                        }
                    }, 'image/png');
                });
            };

            // Upload both signatures
            const studentSignatureUrl = await uploadSignature(studentSigPad.current, 'student-signatures');
            const parentSignatureUrl = await uploadSignature(parentSigPad.current, 'parent-signatures');

            const { error: updateError } = await supabase
                .from('applicant_pool')
                .update({ 
                    phone_number: formData.phone,
                    pledge_accepted: true,
                    privacy_accepted: true,
                    student_signature: studentSignatureUrl,
                    parent_signature: parentSignatureUrl,
                    pledged_at: new Date().toISOString(),
                    status: 'pending'
                })
                .eq('id', applicantData.id);

            if (updateError) throw updateError;
            setStep('pending');
        } catch (err) {
            setError('신청 처리 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
        } finally {
            setLoading(false);
        }
    };

    // 4. Phone Challenge Verification
    const handleChallengeVerify = async (e) => {
        e.preventDefault();
        if (formData.phone === applicantData.phone_number) {
            onLoginSuccess({ 
                ...applicantData, 
                full_name: applicantData.name,
                role: role // Use the currently selected role ('parent' or 'student')
            });
        } else {
            setError('입력하신 전화번호가 등록된 정보와 일치하지 않습니다.');
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#F2F2F7] flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl shadow-ios-indigo/10 overflow-hidden animate-spring-up border border-gray-100">
                {/* Visual Header */}
                <div className="bg-white p-10 text-[#1C1C1E] relative overflow-hidden border-b border-gray-100">
                    <div className="relative z-10 space-y-2">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-6 border border-gray-100 shadow-sm overflow-hidden">
                            <Layout className="w-7 h-7 text-ios-indigo" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter leading-none">{schoolName}</h1>
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
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck="false"
                                        className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none caret-ios-indigo"
                                    />
                                </div>
                                <div className="relative group">
                                    <input 
                                        required
                                        type={role === 'teacher' ? "password" : "text"}
                                        inputMode={role === 'teacher' ? "text" : "numeric"}
                                        pattern={role === 'teacher' ? undefined : "[0-9]*"}
                                        placeholder={role === 'teacher' ? "비밀번호 (PW)" : "학번 5자리 (PW)"}
                                        maxLength={role === 'teacher' ? undefined : 5}
                                        value={role === 'teacher' ? formData.password : formData.studentId}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (role === 'teacher') {
                                                setFormData({...formData, password: val});
                                            } else {
                                                // Force numeric and remove spaces for Student ID
                                                setFormData({...formData, studentId: val.replace(/[^0-9]/g, '')});
                                            }
                                        }}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck="false"
                                        className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none caret-ios-indigo"
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
                                <p className="text-[11px] text-ios-gray text-center font-bold">본인은 자기주도학습에 참여함에 있어 올바른 학습 태도와 공동체 질서를 준수하며, 자기주도적 학습 능력 신장을 도모하고자 다음 사항을 성실히 이행할 것을 서약합니다.</p>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 max-h-48 overflow-y-auto space-y-4 text-[11px] font-bold text-ios-gray leading-relaxed border border-gray-100">
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[행동 지침 및 주의 사항]</p>
                                    <p>1. 학습실 내에서는 항상 정숙을 유지하며, 타인의 학습에 방해가 되는 언행을 하지 않습니다.</p>
                                    <p>2. 지정된 좌석 외의 자리를 무단으로 사용하거나 이동하지 않습니다.</p>
                                    <p>3. 학습 시간을 철저하게 지켜야 하며 무단 이탈, 취식, 전자기기 오남용 등의 행위를 하지 않습니다.</p>
                                    <p>4. 청람재 내 모든 시설물은 깨끗이 사용하며, 고의 또는 과실로 파손 시 이에 대한 책임을 집니다.</p>
                                    <p>5. 지도 교사 및 운영 규정을 성실히 따르며, 위반 시 불이익이 있을 수 있음을 인지합니다.</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[학습 태도 및 자기주도 학습]</p>
                                    <p>1. 스스로 학습 목표를 설정하고, 목표 달성을 위해 문제 해결 과정을 주도적으로 수행합니다.</p>
                                    <p>2. 자기주도학습을 단순한 체류 시간이 아닌 자기 성장의 시간으로 활용합니다.</p>
                                    <p>3. 올바른 학습 습관 형성을 위해 성실하고 책임감 있는 태도로 참여합니다.</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[가정과 연계한 생활 지도]</p>
                                    <p>1. 효율적이고 건전한 학습 및 생활 습관을 형성할 수 있도록 가정과 연계하여 지도에 협조합니다.</p>
                                    <p>2. 학생과 학부모가 야간자율학습의 취지와 운영 방침을 충분히 이해하고 이에 동의합니다.</p>
                                </div>                                
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[안전 및 학교폭력 예방]</p>
                                    <p>1. 쾌적하고 안전한 학습 환경 조성을 위해 질서를 준수합니다.</p>
                                    <p>2. 학교폭력 예방 교육 및 안전 관리 지침을 성실히 따르며, 타인을 존중하는 태도를 유지합니다.</p>
                                    <p>3. 자기주도학습 종료 후, 곧바로 귀가합니다.</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[감염병 예방 및 위생 수칙]</p>
                                    <p>1. 감염병 확산 예방을 위해 개인 위생 수칙 및 학교의 방역 지침을 철저히 준수합니다.</p>
                                    <p>2. 발열 및 이상 증상이 있을 경우 즉시 지도 교사에게 알립니다.</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[#1C1C1E] font-black">[개인정보 활용 동의]</p>
                                    <p>1. 자기주도학습 운영 및 서비스 제공을 위해 학생의 휴대전화 번호를 수집하는 것에 동의합니다.</p>
                                    <p>2. 수집된 개인정보는 로그인 및 신원 확인 용도로만 사용되며, 본 학년도 자기주도학습 운영 종료 후 자동 파기됩니다.</p>
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
                                        className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none caret-ios-indigo"
                                    />
                                </div>

                                <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.pledgeAccepted}
                                        onChange={(e) => setFormData({...formData, pledgeAccepted: e.target.checked})}
                                        className="mt-0.5"
                                    />
                                    <span className="text-[11px] font-black text-[#1C1C1E]">행동 지침 및 기타 서약 사항을 확인했습니다. (필수)</span>
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

                                {/* Signature Pads */}
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-[#1C1C1E]">학생 서명</span>
                                            <button 
                                                type="button" 
                                                onClick={() => studentSigPad.current?.clear()}
                                                className="text-[10px] text-ios-gray font-bold flex items-center gap-1 hover:text-ios-rose transition-colors"
                                            >
                                                <Eraser className="w-3 h-3" /> 지우기
                                            </button>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden h-32 relative">
                                            <InlineSignaturePad 
                                                ref={studentSigPad}
                                                penColor="#1C1C1E"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-[#1C1C1E]">학부모 서명</span>
                                            <button 
                                                type="button" 
                                                onClick={() => parentSigPad.current?.clear()}
                                                className="text-[10px] text-ios-gray font-bold flex items-center gap-1 hover:text-ios-rose transition-colors"
                                            >
                                                <Eraser className="w-3 h-3" /> 지우기
                                            </button>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden h-32 relative">
                                            <InlineSignaturePad 
                                                ref={parentSigPad}
                                                penColor="#1C1C1E"
                                            />
                                        </div>
                                        <p className="text-[10px] text-ios-rose font-black text-center pt-1 animate-pulse">
                                            주의. 반드시 학부모님께서 직접 서명하셔야 합니다.
                                        </p>
                                    </div>
                                </div>
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
                                    <h2 className="text-xl font-black text-[#1C1C1E] tracking-tight">
                                        {role === 'parent' ? '학생 확인' : '본인 확인'}
                                    </h2>
                                    <p className="text-[11px] text-ios-gray font-bold">
                                        {role === 'parent' ? '자녀의 전화번호를 입력해 주세요.' : '등록된 전화번호를 입력해 주세요.'}
                                    </p>
                                </div>
                            </div>

                            <div className="relative group">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray group-focus-within:text-ios-indigo transition-colors" />
                                <input 
                                    required
                                    type="tel" 
                                    placeholder={role === 'parent' ? "자녀의 휴대폰 번호" : "등록된 휴대폰 번호"}
                                    value={formData.phone}
                                    onChange={(e) => setFormData({...formData, phone: autoHyphen(e.target.value)})}
                                    className="w-full bg-gray-50 border border-transparent focus:border-ios-indigo focus:bg-white rounded-2xl pl-12 pr-6 py-4 text-sm font-bold transition-all outline-none caret-ios-indigo"
                                />
                            </div>

                            {error && (
                                <div className="text-ios-rose text-[11px] font-black text-center animate-shake">{error}</div>
                            )}

                            <button 
                                type="submit"
                                className="w-full py-4 bg-white text-[#1C1C1E] border border-gray-100 rounded-2xl font-black text-sm shadow-xl shadow-gray-200/50 ios-tap"
                            >
                                {role === 'parent' ? '자녀 확인 완료' : '본인 확인 완료'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomLogin;

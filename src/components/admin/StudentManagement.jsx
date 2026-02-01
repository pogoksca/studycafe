import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Users, Upload, Check, X, Search, FileDown, MoreHorizontal, AlertCircle, Phone, ClipboardCheck, Download, Printer, Loader2, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';

const PledgeTemplate = ({ applicant, schoolInfo }) => (
    <div className="pledge-doc">
        <div>
            <div className="pledge-header">
                <h1 className="pledge-title">자기주도학습 참여 서약서</h1>
            </div>

            <p className="intro-text">
                본인은 자기주도학습에 참여함에 있어 올바른 학습 태도와 공동체 질서를 준수하며,<br/>
                자기주도적 학습 능력 신장을 도모하고자 다음 사항을 성실히 이행할 것을 서약합니다.
            </p>

            <div className="content-flex">
                <div className="pledge-section">
                    <div className="section-title">[행동 지침 및 주의 사항]</div>
                    <div className="pledge-content">
                        <p>1. 학습실 내에서는 항상 정숙을 유지하며, 타인의 학습에 방해가 되는 언행을 하지 않습니다.</p>
                        <p>2. 지정된 좌석 외의 자리를 무단으로 사용하거나 이동하지 않습니다.</p>
                        <p>3. 학습 시간을 철저하게 지켜야 하며 무단 이탈, 취식, 전자기기 오남용 등의 행위를 하지 않습니다.</p>
                        <p>4. 청람재 내 모든 시설물은 깨끗이 사용하며, 고의 또는 과실로 파손 시 이에 대한 책임을 집니다.</p>
                        <p>5. 지도 교사 및 운영 규정을 성실히 따르며, 위반 시 불이익이 있을 수 있음을 인지합니다.</p>
                    </div>
                </div>

                <div className="pledge-section">
                    <div className="section-title">[학습 태도 및 자기주도 학습]</div>
                    <div className="pledge-content">
                        <p>1. 스스로 학습 목표를 설정하고, 목표 달성을 위해 문제 해결 과정을 주도적으로 수행합니다.</p>
                        <p>2. 자기주도학습을 단순한 체류 시간이 아닌 자기 성장의 시간으로 활용합니다.</p>
                        <p>3. 올바른 학습 습관 형성을 위해 성실하고 책임감 있는 태도로 참여합니다.</p>
                    </div>
                </div>

                <div className="pledge-section">
                    <div className="section-title">[가정과 연계한 생활 지도]</div>
                    <div className="pledge-content">
                        <p>1. 효율적이고 건전한 학습 및 생활 습관을 형성할 수 있도록 가정과 연계하여 지도에 협조합니다.</p>
                        <p>2. 학생과 학부모가 야간자율학습의 취지와 운영 방침을 충분히 이해하고 이에 동의합니다.</p>
                    </div>
                </div>

                <div className="pledge-section">
                    <div className="section-title">[안전 및 학교폭력 예방]</div>
                    <div className="pledge-content">
                        <p>1. 쾌적하고 안전한 학습 환경 조성을 위해 질서를 준수합니다.</p>
                        <p>2. 학교폭력 예방 교육 및 안전 관리 지침을 성실히 따르며, 타인을 존중하는 태도를 유지합니다.</p>
                        <p>3. 자기주도학습 종료 후, 곧바로 귀가합니다.</p>
                    </div>
                </div>

                <div className="pledge-section">
                    <div className="section-title">[감염병 예방 및 위생 수칙]</div>
                    <div className="pledge-content">
                        <p>1. 감염병 확산 예방을 위해 개인 위생 수칙 및 학교의 방역 지침을 철저히 준수합니다.</p>
                        <p>2. 발열 및 이상 증상이 있을 경우 즉시 지도 교사에게 알립니다.</p>
                    </div>
                </div>

                <div className="pledge-section">
                    <div className="section-title">[개인정보 활용 동의]</div>
                    <div className="pledge-content">
                        <p>1. 자기주도학습 운영 및 서비스 제공을 위해 학생의 휴대전화 번호를 수집하는 것에 동의합니다.</p>
                        <p>2. 수집된 개인정보는 로그인 및 신원 확인 용도로만 사용되며, 본 학년도 자기주도학습 운영 종료 후 자동 파기됩니다.</p>
                    </div>
                </div>
            </div>
        </div>

        <div>
            <div className="info-grid">
                <div className="info-item">
                    <span className="info-label">학 번:</span>
                    <span>{applicant.student_id}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">이 름:</span>
                    <span>{applicant.name}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">연락처:</span>
                    <span>{applicant.phone_number || '-'}</span>
                </div>
            </div>

            <div className="signature-block">
                <div className="sig-container">
                    <div className="sig-pad">
                        {applicant.student_signature ? (
                            <img src={applicant.student_signature} alt="학생 서명" className="sig-image" crossOrigin="anonymous" />
                        ) : (
                            <span className="text-gray-300 text-[10px]">서명 없음</span>
                        )}
                    </div>
                    <div className="sig-label">학 생 (서명)</div>
                </div>
                <div className="sig-container">
                    <div className="sig-pad">
                        {applicant.parent_signature ? (
                            <img src={applicant.parent_signature} alt="학부모 서명" className="sig-image" crossOrigin="anonymous" />
                        ) : (
                            <span className="text-gray-300 text-[10px]">서명 없음</span>
                        )}
                    </div>
                    <div className="sig-label">학부모 (서명)</div>
                </div>
            </div>

            <div className="footer-date">
                {applicant.pledged_at ? (
                    new Date(applicant.pledged_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })
                ) : '-'}
            </div>

            <div className="footer-school">
                {schoolInfo.name ? `${schoolInfo.name}${schoolInfo.level || ''}` : 'GOE학교'}장 귀하
            </div>
        </div>
    </div>
);

const StudentManagement = () => {
    const [applicants, setApplicants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [sortBy, setSortBy] = useState('id-asc'); // id-asc, id-desc, name-asc, name-desc, grade-1, grade-2, grade-3
    const [isPrinting, setIsPrinting] = useState(false);
    const [isBulkPrinting, setIsBulkPrinting] = useState(false);
    const [printApplicant, setPrintApplicant] = useState(null);
    const [bulkPrintApplicants, setBulkPrintApplicants] = useState([]);
    const [isBulkPrintModalOpen, setIsBulkPrintModalOpen] = useState(false);
    const [selectedBulkGrades, setSelectedBulkGrades] = useState(['1']);
    const [schoolInfo, setSchoolInfo] = useState({ name: '', level: '' });

    useEffect(() => {
        fetchApplicants();
        fetchSchoolInfo();
    }, []);

    const fetchSchoolInfo = async () => {
        const { data } = await supabase.from('configs').select('value').eq('key', 'school_info').single();
        if (data?.value) {
            setSchoolInfo(data.value);
        }
    };

    const fetchApplicants = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('applicant_pool')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) {
            console.error('Error fetching applicants:', error);
        } else {
            setApplicants(data || []);
        }
        setLoading(false);
    };

    const handleDownloadTemplate = () => {
        // Create a worksheet with headers "이름" and "학번"
        const ws = XLSX.utils.json_to_sheet([
            { '이름': '', '학번': '' }
        ]);
        
        // Fix column widths
        ws['!cols'] = [
            { wch: 15 }, // 이름
            { wch: 15 }  // 학번
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "양식");
        
        // Write file
        XLSX.writeFile(wb, "학생_업로드_양식.xlsx");
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            // Expecting columns: "이름" (Name), "학번" (Student ID), "역할" (Role - optional)
            const formattedData = data.map(item => ({
                name: item['이름'],
                student_id: String(item['학번']).padStart(5, '0'),
                role: item['역할'] === '학부모' ? 'parent' : 
                      item['역할'] === '선생님' ? 'teacher' : 
                      item['역할'] === '관리자' ? 'admin' : 'student',
                status: 'applied'
            })).filter(item => item.name && item.student_id);

            const { error } = await supabase
                .from('applicant_pool')
                .upsert(formattedData, { onConflict: 'name,student_id' });

            if (error) {
                alert('일괄 등록 실패: ' + error.message);
            } else {
                alert(`${formattedData.length}명의 학생 정보가 등록되었습니다.`);
                fetchApplicants();
            }
            setLoading(false);
        };
        reader.readAsBinaryString(file);
    };

    const getFileNameFromUrl = (url) => {
        if (!url) return null;
        const parts = url.split('/');
        return parts[parts.length - 1];
    };

    const handleApproval = async (applicant, status, reason = '', role = applicant.role) => {
        setLoading(true);

        try {
            // Special handling for reset (moving back to 'applied')
            if (status === 'applied') {
                const results = [];
                
                // 1. Delete Student Signature if exists
                if (applicant.student_signature) {
                    const fileName = getFileNameFromUrl(applicant.student_signature);
                    if (fileName) {
                        results.push(supabase.storage.from('student-signatures').remove([fileName]));
                    }
                }
                
                // 2. Delete Parent Signature if exists
                if (applicant.parent_signature) {
                    const fileName = getFileNameFromUrl(applicant.parent_signature);
                    if (fileName) {
                        results.push(supabase.storage.from('parent-signatures').remove([fileName]));
                    }
                }
                
                // Wait for storage deletions
                if (results.length > 0) {
                    await Promise.all(results);
                }

                // 3. Reset database fields
                const { error } = await supabase
                    .from('applicant_pool')
                    .update({ 
                        status: 'applied',
                        rejection_reason: null,
                        phone_number: null,
                        pledge_accepted: false,
                        privacy_accepted: false,
                        student_signature: null,
                        parent_signature: null,
                        pledged_at: null
                    })
                    .eq('id', applicant.id);

                if (error) throw error;
            } else {
                // Normal status update (pending, approved, rejected)
                // Clear rejection reason if moving to approved
                const updateData = { status, rejection_reason: reason, role };
                if (status === 'approved') {
                    updateData.rejection_reason = null;
                }
                
                const { error } = await supabase
                    .from('applicant_pool')
                    .update(updateData)
                    .eq('id', applicant.id);

                if (error) throw error;
            }

            fetchApplicants();
            setSelectedApplicant(null);
            setRejectionReason('');
        } catch (err) {
            alert('작업 실패: ' + (err.message || '알 수 없는 오류'));
        } finally {
            setLoading(false);
        }
    };

    const handlePrintPledge = async (applicant) => {
        setPrintApplicant(applicant);
        setIsPrinting(true);
        
        // Wait for images to load and portal to render
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
            setPrintApplicant(null);
        }, 1200);
    };

    const handleBulkPrint = async () => {
        if (selectedBulkGrades.length === 0) {
            alert('인쇄할 학년을 최소 하나 이상 선택해주세요.');
            return;
        }

        setLoading(true);
        try {
            // Construct query for multiple grades
            let query = supabase
                .from('applicant_pool')
                .select('*')
                .eq('status', 'approved')
                .eq('role', 'student')
                .order('student_id', { ascending: true });

            // Apply OR filter for multiple grades
            const gradeFilters = selectedBulkGrades.map(grade => `student_id.like.${grade}%`).join(',');
            query = query.or(gradeFilters);

            const { data, error } = await query;

            if (error) throw error;
            if (!data || data.length === 0) {
                alert(`${selectedBulkGrades.join(', ')}학년에 승인된 학생이 없습니다.`);
                return;
            }

            setBulkPrintApplicants(data);
            setIsBulkPrinting(true);
            setIsBulkPrintModalOpen(false);
            
            setTimeout(() => {
                window.print();
                setIsBulkPrinting(false);
                setBulkPrintApplicants([]);
            }, 1500);
        } catch (err) {
            console.error('Error fetching bulk print data:', err);
            alert('인쇄 데이터를 가져오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const filteredApplicants = applicants
        .filter(a => {
            const matchesSearch = a.name.includes(searchTerm) || a.student_id.includes(searchTerm);
            const matchesFilter = filterStatus === 'all' || a.status === filterStatus;
            const matchesGrade = 
                sortBy === 'grade-1' ? a.student_id.startsWith('1') :
                sortBy === 'grade-2' ? a.student_id.startsWith('2') :
                sortBy === 'grade-3' ? a.student_id.startsWith('3') : true;
            
            return matchesSearch && matchesFilter && matchesGrade;
        })
        .sort((a, b) => {
            if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
            if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
            if (sortBy === 'id-asc' || sortBy.startsWith('grade')) return a.student_id.localeCompare(b.student_id);
            if (sortBy === 'id-desc') return b.student_id.localeCompare(a.student_id);
            return 0;
        });

    return (
        <div className="bg-white rounded-[6px] border border-gray-100 flex flex-col h-full overflow-hidden shadow-sm animate-spring-up">
            {/* Header */}
            <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[6px] bg-ios-indigo/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-ios-indigo" />
                    </div>
                    <div>
                        <h3 className="text-[14px] font-black text-[#1C1C1E]">학생 승인 및 등업 관리</h3>
                        <p className="text-[10px] text-ios-gray font-black uppercase tracking-widest mt-0.5">Applicant Pool Management</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsBulkPrintModalOpen(true)}
                        className="flex items-center gap-2 bg-white hover:bg-gray-50 text-[#1C1C1E] px-4 py-2.5 rounded-[6px] text-xs font-black transition-all border border-gray-200 ios-tap"
                    >
                        <Printer className="w-4 h-4 text-ios-indigo" />
                        서약서 일괄 인쇄
                    </button>
                    <button 
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-2 bg-white hover:bg-gray-50 text-[#1C1C1E] px-4 py-2.5 rounded-[6px] text-xs font-black transition-all border border-gray-200 ios-tap"
                    >
                        <FileDown className="w-4 h-4 text-ios-indigo" />
                        업로드 양식
                    </button>
                    <label className="flex items-center gap-2 bg-[#1C1C1E] hover:bg-[#2C2C2E] text-white px-4 py-2.5 rounded-[6px] text-xs font-black transition-all border border-transparent cursor-pointer ios-tap shadow-sm">
                        <Upload className="w-4 h-4 text-white" />
                        엑셀 업로드
                        <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
                    </label>
                </div>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-50 flex flex-col md:flex-row gap-4 shrink-0">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="이름 또는 학번 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 bg-white border border-gray-200 rounded-[6px] pl-10 pr-4 py-2 text-xs font-bold focus:ring-1 focus:ring-ios-indigo transition-all"
                        />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-white border border-gray-200 rounded-[6px] px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-ios-indigo transition-all outline-none cursor-pointer min-w-[140px]"
                        >
                            <option value="id-asc">학번순 (오름차순)</option>
                            <option value="id-desc">학번순 (내림차순)</option>
                            <option value="name-asc">이름순 (오름차순)</option>
                            <option value="name-desc">이름순 (내림차순)</option>
                            <option value="grade-1">1학년 (학번순)</option>
                            <option value="grade-2">2학년 (학번순)</option>
                            <option value="grade-3">3학년 (학번순)</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-2">
                    {['all', 'applied', 'pending', 'approved', 'rejected'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-[6px] text-[10px] font-black uppercase tracking-widest transition-all ${
                                filterStatus === status 
                                    ? 'bg-[#1C1C1E] text-white shadow-md' 
                                    : 'bg-white text-ios-gray border border-gray-200 hover:border-ios-indigo'
                            }`}
                        >
                            {status === 'all' ? '전체' :
                             status === 'applied' ? '등록' :
                             status === 'pending' ? '대기' :
                             status === 'approved' ? '승인' : '거절'}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10">
                        <tr>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">학번</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">이름</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">역할</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">전화번호</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">서약서</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">상태</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-center">작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredApplicants.map((applicant) => (
                            <tr key={applicant.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-6 py-4 align-middle text-xs font-mono font-black text-ios-indigo text-center">{applicant.student_id}</td>
                                <td className="px-6 py-4 align-middle text-xs font-bold text-[#1C1C1E] text-center">{applicant.name}</td>
                                <td className="px-6 py-4 align-middle text-center">
                                    <span className="text-[10px] font-black text-ios-gray uppercase tracking-widest">
                                        Student
                                    </span>
                                </td>
                                <td className="px-6 py-4 align-middle text-center">
                                    <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-ios-gray">
                                        {applicant.phone_number ? (
                                            <>
                                                <Phone className="w-3 h-3 text-ios-emerald" />
                                                {applicant.phone_number}
                                            </>
                                        ) : '-'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-middle text-center">
                                    {applicant.pledge_accepted ? (
                                            <div className="flex items-center justify-center gap-2 group/download">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="flex items-center gap-1 text-[10px] font-black text-ios-indigo">
                                                        <ClipboardCheck className="w-3 h-3" /> 완료
                                                    </span>
                                                    <span className="text-[9px] text-ios-gray opacity-50 font-mono">
                                                        {new Date(applicant.pledged_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={() => handlePrintPledge(applicant)}
                                                    className="p-1.5 rounded-full bg-ios-indigo/5 text-ios-indigo hover:bg-ios-indigo hover:text-white transition-all shadow-sm"
                                                    title="서약서 다운로드"
                                                >
                                                    <Download className="w-3 h-3" />
                                                </button>
                                            </div>
                                    ) : (
                                        <span className="text-[10px] font-black text-ios-gray opacity-30">미작성</span>
                                    )}
                                </td>
                                 <td className="px-6 py-4 align-middle text-center">
                                    <span 
                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                            applicant.status === 'approved' ? 'bg-[#ECFDF5] text-[#065F46]' :
                                            applicant.status === 'pending' ? 'bg-[#FFFBEB] text-[#92400E]' :
                                            applicant.status === 'rejected' ? 'bg-[#FFF1F2] text-[#9F1239]' :
                                            'bg-gray-100 text-ios-gray'
                                        }`}
                                        title={applicant.status === 'rejected' ? `거절 사유: ${applicant.rejection_reason || '사유 없음'}` : ''}
                                    >
                                        {applicant.status === 'approved' ? '승인됨' :
                                         applicant.status === 'pending' ? '승인 대기' :
                                         applicant.status === 'rejected' ? '거절됨' : '신청 전'}
                                    </span>
                                </td>
                                 <td className="px-6 py-4 align-middle text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button 
                                            onClick={() => handleApproval(applicant, 'approved')}
                                            className="p-2 rounded-[6px] bg-ios-emerald/10 text-ios-emerald hover:bg-ios-emerald hover:text-white transition-all ios-tap shadow-sm"
                                            title="승인"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => setSelectedApplicant(applicant)}
                                            className="p-2 rounded-[6px] bg-ios-rose/10 text-ios-rose hover:bg-ios-rose hover:text-white transition-all ios-tap shadow-sm"
                                            title="거절"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (confirm(`${applicant.name} 학생의 상태를 초기화하시겠습니까? (서약서 및 서명 데이터가 삭제됩니다)`)) {
                                                    handleApproval(applicant, 'applied');
                                                }
                                            }}
                                            className="p-2 rounded-[6px] bg-gray-100 text-ios-gray hover:bg-[#1C1C1E] hover:text-white transition-all ios-tap shadow-sm"
                                            title="상태 초기화"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredApplicants.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-ios-gray space-y-3">
                        <AlertCircle className="w-10 h-10 opacity-20" />
                        <p className="text-xs font-black">표시할 데이터가 없습니다.</p>
                    </div>
                )}
            </div>

            {/* Bulk Print Grade Selection Modal */}
            {isBulkPrintModalOpen && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <div className="bg-white rounded-ios w-full max-w-sm shadow-2xl animate-spring-up overflow-hidden">
                        <div className="p-6 space-y-6">
                            <div className="space-y-2">
                                <h4 className="text-[14px] font-black text-[#1C1C1E]">인쇄할 학년 선택</h4>
                                <p className="text-[10px] text-ios-gray font-black uppercase tracking-widest">Select Grade for Bulk Printing</p>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3">
                                {['1', '2', '3'].map((grade) => (
                                    <button
                                        key={grade}
                                        onClick={() => {
                                            setSelectedBulkGrades(prev => 
                                                prev.includes(grade) 
                                                ? prev.filter(g => g !== grade)
                                                : [...prev, grade].sort()
                                            );
                                        }}
                                        className={`py-4 rounded-xl text-sm font-black transition-all ios-tap ${
                                            selectedBulkGrades.includes(grade) 
                                            ? 'bg-ios-indigo text-white shadow-lg shadow-ios-indigo/20' 
                                            : 'bg-gray-50 text-ios-gray hover:bg-gray-100'
                                        }`}
                                    >
                                        {grade}학년
                                    </button>
                                ))}
                            </div>
                            
                            <div className="bg-ios-amber/5 border border-ios-amber/10 rounded-xl p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-3.5 h-3.5 text-ios-amber" />
                                    <span className="text-[11px] font-black text-[#1C1C1E]">인쇄 대상 안내</span>
                                </div>
                                <p className="text-[10px] text-ios-gray font-bold leading-relaxed">
                                    사이트 이용이 <span className="text-ios-indigo">‘승인’</span>된 학생만 서약서가 인쇄됩니다. <br/>
                                    ‘승인대기’ 중이거나 ‘거절’ 상태인 학생은 명단에서 제외됩니다.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button 
                                    onClick={() => setIsBulkPrintModalOpen(false)}
                                    className="w-full py-4 bg-gray-100 text-ios-gray rounded-xl text-xs font-black ios-tap"
                                >
                                    취소
                                </button>
                                <button 
                                    onClick={handleBulkPrint}
                                    className="w-full py-4 bg-ios-indigo text-white rounded-xl text-xs font-black shadow-lg shadow-ios-indigo/20 ios-tap"
                                >
                                    인쇄 시작
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {selectedApplicant && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <div className="bg-white rounded-ios w-full max-w-sm shadow-2xl animate-spring-up overflow-hidden">
                        <div className="p-6 space-y-4">
                            <h4 className="text-[14px] font-black text-[#1C1C1E]">{selectedApplicant.name} 학생 거절 사유</h4>
                            <textarea 
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="거절 사유를 입력하세요... (예: 학년 정보 불일치)"
                                className="w-full h-32 bg-gray-50 border border-gray-200 rounded-[6px] p-3 text-xs font-bold focus:ring-1 focus:ring-ios-rose transition-all resize-none"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => setSelectedApplicant(null)}
                                    className="w-full py-3 bg-gray-100 text-ios-gray rounded-[6px] text-xs font-black ios-tap"
                                >
                                    취소
                                </button>
                                <button 
                                    onClick={() => handleApproval(selectedApplicant, 'rejected', rejectionReason)}
                                    className="w-full py-3 bg-[#1C1C1E] text-white rounded-[6px] text-xs font-black shadow-lg shadow-black/20 ios-tap"
                                >
                                    거절 처리
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer Stats */}
            <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between shrink-0">
                <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-ios-indigo" />
                        <span className="text-[9px] font-black text-ios-gray uppercase tracking-widest">전체: {applicants.length}명</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-ios-amber" />
                        <span className="text-[9px] font-black text-ios-gray uppercase tracking-widest">대기: {applicants.filter(a => a.status === 'pending').length}명</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-ios-emerald" />
                        <span className="text-[9px] font-black text-ios-gray uppercase tracking-widest">승인: {applicants.filter(a => a.status === 'approved').length}명</span>
                    </div>
                </div>
            </div>
            {/* Bulk Print Portal */}
            {isBulkPrinting && bulkPrintApplicants.length > 0 && createPortal(
                <div id="print-root-bulk" className="bg-white text-black hidden print:block">
                    <style>{`
                        @media print {
                            @page { 
                                size: A4 portrait; 
                                margin: 0; 
                            }
                            body { 
                                margin: 0 !important; 
                                padding: 0 !important; 
                                background: white !important;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            /* Hide app UI during printing */
                            body > #root { 
                                display: none !important; 
                            }
                            #print-root-bulk { display: block !important; }
                            .print-page {
                                width: 210mm !important;
                                min-height: 297mm !important;
                                margin: 0 auto !important;
                                padding: 0 !important;
                                box-sizing: border-box !important;
                                background: white !important;
                                page-break-after: always !important;
                                position: relative !important;
                                display: flex !important;
                                justify-content: center !important;
                                overflow: hidden !important;
                            }
                            .print-page:last-child { page-break-after: auto !important; }
                            .pledge-doc {
                                width: 180mm !important;
                                height: 260mm !important;
                                margin-top: 20mm !important;
                                margin-bottom: 10mm !important;
                                display: flex !important;
                                flex-direction: column !important;
                                justify-content: space-between !important;
                                font-family: 'Pretendard', 'Malgun Gothic', sans-serif !important;
                                color: #000 !important;
                            }
                            .pledge-header {
                                text-align: center !important;
                                margin-bottom: 25px !important;
                                border-bottom: 2px solid #000 !important;
                                padding-bottom: 10px !important;
                            }
                            .pledge-title {
                                font-size: 28pt !important;
                                font-weight: 900 !important;
                                letter-spacing: 10px !important;
                                margin: 0 !important;
                            }
                            .intro-text {
                                text-align: center !important;
                                font-weight: 700 !important;
                                margin-bottom: 25px !important;
                                line-height: 1.8 !important;
                                font-size: 11pt !important;
                                color: #000 !important;
                            }
                            .content-flex {
                                display: flex !important;
                                flex-wrap: wrap !important;
                                justify-content: space-between !important;
                                gap: 20px 0 !important;
                                width: 100% !important;
                            }
                            .pledge-section {
                                width: 48% !important;
                            }
                            .section-title {
                                font-size: 10pt !important;
                                font-weight: 900 !important;
                                margin-bottom: 6px !important;
                                color: #000 !important;
                                border-bottom: 1px solid #ddd !important;
                                display: inline-block !important;
                            }
                            .pledge-content {
                                font-size: 9pt !important;
                                text-align: justify !important;
                                color: #1a1a1a !important;
                                line-height: 1.5 !important;
                            }
                            .pledge-content p {
                                margin-bottom: 2px !important;
                            }
                            .info-grid {
                                display: flex !important;
                                justify-content: space-between !important;
                                margin: 30px 0 15px 0 !important;
                                border: 1.5px solid #000 !important;
                                padding: 12px 25px !important;
                                width: 100% !important;
                                box-sizing: border-box !important;
                            }
                            .info-item {
                                font-size: 11pt !important;
                                color: #000 !important;
                            }
                            .info-label {
                                font-weight: 900 !important;
                                margin-right: 8px !important;
                            }
                            .signature-block {
                                display: flex !important;
                                justify-content: space-around !important;
                                margin-top: 15px !important;
                                text-align: center !important;
                                width: 100% !important;
                            }
                            .sig-container {
                                display: flex !important;
                                flex-direction: column !important;
                                align-items: center !important;
                            }
                            .sig-pad {
                                width: 200px !important;
                                height: 80px !important;
                                border-bottom: 1.5px solid #000 !important;
                                margin-bottom: 8px !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                            }
                            .sig-image {
                                max-width: 100% !important;
                                max-height: 100% !important;
                                object-fit: contain !important;
                            }
                            .sig-label {
                                font-size: 11pt !important;
                                font-weight: 800 !important;
                                color: #000 !important;
                            }
                            .footer-date {
                                text-align: center !important;
                                margin-top: 20px !important;
                                font-size: 14pt !important;
                                font-weight: 700 !important;
                                color: #000 !important;
                            }
                            .footer-school {
                                text-align: center !important;
                                margin-bottom: 0 !important;
                                font-size: 20pt !important;
                                font-weight: 900 !important;
                                color: #000 !important;
                            }
                        }
                    `}</style>
                    {bulkPrintApplicants.map((applicant) => (
                        <div key={applicant.id} className="print-page">
                            <PledgeTemplate applicant={applicant} schoolInfo={schoolInfo} />
                        </div>
                    ))}
                </div>,
                document.body
            )}

            {/* Print Portal */}
            {isPrinting && printApplicant && createPortal(
                <div id="print-root" className="bg-white text-black hidden print:block">
                    <style>{`
                        @media print {
                            @page { 
                                size: A4 portrait; 
                                margin: 0; 
                            }
                            
                            body {
                                margin: 0 !important;
                                padding: 0 !important;
                                background: white !important;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }

                            /* Hide everything except print-root */
                            body > #root {
                                display: none !important;
                            }

                            #print-root {
                                display: flex !important;
                                justify-content: center !important;
                                width: 210mm !important;
                                min-height: 297mm !important;
                                margin: 0 auto !important;
                                padding: 0 !important;
                                box-sizing: border-box !important;
                                background: white !important;
                                position: relative !important;
                                overflow: hidden !important;
                            }

                            .pledge-doc {
                                width: 180mm !important;
                                height: 260mm !important;
                                margin-top: 20mm !important;
                                margin-bottom: 10mm !important;
                                box-sizing: border-box !important;
                                color: #000 !important;
                                display: flex !important;
                                flex-direction: column !important;
                                justify-content: space-between !important;
                                font-family: 'Pretendard', 'Malgun Gothic', sans-serif !important;
                            }

                            .pledge-header {
                                text-align: center !important;
                                margin-bottom: 25px !important;
                                border-bottom: 2px solid #000 !important;
                                padding-bottom: 10px !important;
                            }

                            .pledge-title {
                                font-size: 28pt !important;
                                font-weight: 900 !important;
                                letter-spacing: 10px !important;
                                margin: 0 !important;
                            }

                            .intro-text {
                                text-align: center !important;
                                font-weight: 700 !important;
                                margin-bottom: 25px !important;
                                line-height: 1.8 !important;
                                font-size: 11pt !important;
                            }

                            .content-flex {
                                display: flex !important;
                                flex-wrap: wrap !important;
                                justify-content: space-between !important;
                                gap: 20px 0 !important;
                                width: 100% !important;
                            }

                            .pledge-section {
                                width: 48% !important;
                            }

                            .section-title {
                                font-size: 10pt !important;
                                font-weight: 900 !important;
                                margin-bottom: 6px !important;
                                color: #000 !important;
                                border-bottom: 1px solid #ddd !important;
                                display: inline-block !important;
                            }

                            .pledge-content {
                                font-size: 9pt !important;
                                text-align: justify !important;
                                color: #1a1a1a !important;
                                line-height: 1.5 !important;
                            }

                            .pledge-content p {
                                margin-bottom: 2px !important;
                            }

                            .info-grid {
                                display: flex !important;
                                justify-content: space-between !important;
                                margin: 30px 0 15px 0 !important;
                                border: 1.5px solid #000 !important;
                                padding: 12px 25px !important;
                                width: 100% !important;
                                box-sizing: border-box !important;
                            }

                            .info-item {
                                font-size: 11pt !important;
                            }

                            .info-label {
                                font-weight: 900 !important;
                                margin-right: 8px !important;
                            }

                            .signature-block {
                                display: flex !important;
                                justify-content: space-around !important;
                                margin-top: 15px !important;
                                text-align: center !important;
                                width: 100% !important;
                            }

                            .sig-container {
                                display: flex !important;
                                flex-direction: column !important;
                                align-items: center !important;
                            }

                            .sig-pad {
                                width: 200px !important;
                                height: 80px !important;
                                border-bottom: 1.5px solid #000 !important;
                                margin-bottom: 8px !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                            }

                            .sig-image {
                                max-width: 100% !important;
                                max-height: 100% !important;
                                object-fit: contain !important;
                            }

                            .sig-label {
                                font-size: 11pt !important;
                                font-weight: 800 !important;
                            }

                            .footer-date {
                                text-align: center !important;
                                margin-top: 20px !important;
                                font-size: 14pt !important;
                                font-weight: 700 !important;
                            }

                            .footer-school {
                                text-align: center !important;
                                margin-bottom: 0 !important;
                                font-size: 20pt !important;
                                font-weight: 900 !important;
                            }
                        }
                        #print-root { display: none; }
                    `}</style>
                    <div id="print-root">
                        <PledgeTemplate applicant={printApplicant} schoolInfo={schoolInfo} />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default StudentManagement;

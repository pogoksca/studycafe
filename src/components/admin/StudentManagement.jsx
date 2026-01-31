import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Upload, Check, X, Search, FileDown, MoreHorizontal, AlertCircle, Phone, ClipboardCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

const StudentManagement = () => {
    const [applicants, setApplicants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [sortBy, setSortBy] = useState('id-asc'); // id-asc, id-desc, name-asc, name-desc, grade-1, grade-2, grade-3

    useEffect(() => {
        fetchApplicants();
    }, []);

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
                const { error } = await supabase
                    .from('applicant_pool')
                    .update({ status, rejection_reason: reason, role })
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
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100">학번</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100">이름</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100">역할</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100">전화번호</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100">서약서</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100">상태</th>
                            <th className="px-6 py-3 text-[10px] font-black text-ios-gray uppercase tracking-widest border-b border-gray-100 text-right">작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredApplicants.map((applicant) => (
                            <tr key={applicant.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-6 py-4 align-middle text-xs font-mono font-black text-ios-indigo">{applicant.student_id}</td>
                                <td className="px-6 py-4 align-middle text-xs font-bold text-[#1C1C1E]">{applicant.name}</td>
                                <td className="px-6 py-4 align-middle">
                                    <span className="text-[10px] font-black text-ios-gray uppercase tracking-widest">
                                        Student
                                    </span>
                                </td>
                                <td className="px-6 py-4 align-middle">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-ios-gray">
                                        {applicant.phone_number ? (
                                            <>
                                                <Phone className="w-3 h-3 text-ios-emerald" />
                                                {applicant.phone_number}
                                            </>
                                        ) : '-'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-middle">
                                    {applicant.pledge_accepted ? (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="flex items-center gap-1 text-[10px] font-black text-ios-indigo">
                                                <ClipboardCheck className="w-3 h-3" /> 완료
                                            </span>
                                            <span className="text-[9px] text-ios-gray opacity-50 font-mono">
                                                {new Date(applicant.pledged_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-black text-ios-gray opacity-30">미작성</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 align-middle">
                                    {applicant.status === 'applied' ? (
                                        <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-gray-100 text-ios-gray">
                                            신청 전
                                        </span>
                                    ) : (
                                        <select 
                                            value={applicant.status}
                                            onChange={(e) => handleApproval(applicant, e.target.value)}
                                            className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border-none focus:ring-1 transition-all cursor-pointer ${
                                                applicant.status === 'approved' ? 'bg-[#ECFDF5] text-[#065F46] focus:ring-emerald-500/20' :
                                                applicant.status === 'pending' ? 'bg-[#FFFBEB] text-[#92400E] focus:ring-amber-500/20' :
                                                applicant.status === 'rejected' ? 'bg-[#FFF1F2] text-[#9F1239] focus:ring-rose-500/20' :
                                                'bg-[#F3F4F6] text-[#4B5563] focus:ring-gray-300/20'
                                            }`}
                                        >
                                            <option value="pending">승인 대기</option>
                                            <option value="approved">승인됨</option>
                                            <option value="rejected">거절됨</option>
                                            <option value="applied">신청 전 (초기화)</option>
                                        </select>
                                    )}
                                </td>
                                <td className="px-6 py-4 align-middle text-right">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {applicant.status === 'pending' && (
                                            <>
                                                <button 
                                                    onClick={() => handleApproval(applicant, 'approved')}
                                                    className="p-1.5 rounded-[4px] bg-ios-emerald/10 text-ios-emerald hover:bg-[#1C1C1E] text-white transition-all ios-tap"
                                                    title="승인"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => setSelectedApplicant(applicant)}
                                                    className="p-1.5 rounded-[4px] bg-ios-rose/10 text-ios-rose hover:bg-[#1C1C1E] text-white transition-all ios-tap"
                                                    title="거절"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        )}
                                        <button className="p-1.5 rounded-[4px] bg-gray-100 text-ios-gray hover:bg-gray-200 transition-all ios-tap">
                                            <MoreHorizontal className="w-3.5 h-3.5" />
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
        </div>
    );
};

export default StudentManagement;

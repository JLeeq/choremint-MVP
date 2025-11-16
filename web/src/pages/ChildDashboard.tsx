import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';

interface ChildSession {
  childId: string;
  nickname: string;
  pin: string;
  points: number;
  familyId: string;
  loggedInAt: number;
}

export default function ChildDashboard() {
  const [childSession, setChildSession] = useState<ChildSession | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Load child session
    const session = localStorage.getItem('child_session');
    if (!session) {
      navigate('/');
      return;
    }

    try {
      const parsed = JSON.parse(session);
      setChildSession(parsed);
      loadSubmissions(parsed.childId);
    } catch (e) {
      localStorage.removeItem('child_session');
      navigate('/');
    }
  }, [navigate]);

  const loadSubmissions = async (childId: string) => {
    const { data } = await supabase
      .from('submissions')
      .select('*')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setSubmissions(data);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedFile || !childSession) {
      setError('사진을 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${childSession.childId}-${Date.now()}.${fileExt}`;
      const filePath = `submissions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      const { error: submissionError } = await supabase
        .from('submissions')
        .insert({
          child_id: childSession.childId,
          family_id: childSession.familyId,
          photo_url: urlData.publicUrl,
          status: 'pending',
        });

      if (submissionError) throw submissionError;

      alert('사진이 성공적으로 업로드되었습니다!');
      setSelectedFile(null);
      setPreview('');
      loadSubmissions(childSession.childId);
    } catch (err: any) {
      setError(err.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Remove all Supabase channels
      await supabase.removeAllChannels();
      
      // Clear child session from localStorage
      localStorage.removeItem('child_session');
      
      // Clear all storage to be safe
      localStorage.clear();
      sessionStorage.clear();
      
      // Force navigation to login page
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Force navigation even if there's an error
      localStorage.removeItem('child_session');
      window.location.href = '/';
    }
  };

  if (!childSession) {
    return <div className="min-h-screen flex items-center justify-center">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                안녕하세요, {childSession.nickname}님! 👋
              </h1>
              <p className="text-gray-600 mt-1">
                현재 포인트: <span className="font-bold text-orange-500 text-lg inline-flex items-center gap-1">
                  <Icon name="star" size={18} className="md:w-5 md:h-5" />
                  {childSession.points}점
                </span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📸 할 일 완료 사진 올리기</h2>
          
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                사진 선택
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
            </div>

            {preview && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">📷 미리보기</p>
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-xl"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700 font-medium">⚠️ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !selectedFile}
              className="w-full px-6 py-4 bg-gradient-to-r from-orange-400 to-pink-400 text-white rounded-xl hover:from-orange-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-lg hover:shadow-xl"
            >
              {loading ? '업로드 중...' : '✅ 완료 사진 올리기'}
            </button>
          </form>
        </div>

        {/* Submission History */}
        <div className="bg-white rounded-3xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📋 제출 내역</h2>
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">아직 제출한 사진이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <div key={submission.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <img
                    src={submission.photo_url}
                    alt="Submission"
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-4">
                    <div className="flex justify-between items-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        submission.status === 'approved' 
                          ? 'bg-green-100 text-green-700' 
                          : submission.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {submission.status === 'approved' ? '✅ 승인됨' : 
                         submission.status === 'pending' ? '⏳ 대기 중' : '❌ 거절됨'}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(submission.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


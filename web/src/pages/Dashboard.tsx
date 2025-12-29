import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';

interface Child {
  id: string;
  nickname: string;
  points: number;
  family_id: string;
  pin: string;
}

interface Submission {
  id: string;
  child_id: string;
  photo_url: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  child: Child;
}

export default function Dashboard() {
  const [familyCode, setFamilyCode] = useState<string>('');
  const [children, setChildren] = useState<Child[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [newNickname, setNewNickname] = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/');
      return;
    }

    // Ensure family exists (creates if doesn't exist)
    let familyData = null;
    
    // Try RPC function first
    const { error: rpcError } = await supabase.rpc(
      'ensure_family_exists',
      { user_id: session.user.id }
    );

    if (rpcError) {
      console.error('RPC Error (expected if DB not set up):', rpcError);
      // Fallback: Try to create family manually if RPC doesn't exist
      // Check if family exists
      const { data: existingFamily } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (existingFamily) {
        familyData = existingFamily;
      } else {
        // Try to create family manually
        const familyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: newFamily, error: insertError } = await supabase
          .from('families')
          .insert({
            parent_id: session.user.id,
            family_code: familyCode,
          })
          .select()
          .single();

        if (insertError) {
          setError('데이터베이스 설정이 필요합니다. Supabase SQL 스크립트를 실행해주세요.');
          console.error('Family creation error:', insertError);
          return;
        }
        familyData = newFamily;
      }
    } else {
      // Load family and children if RPC succeeded
      const { data } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();
      
      familyData = data;
    }

    if (!familyData) {
      setError('가족 정보를 불러올 수 없습니다. 데이터베이스 설정을 확인해주세요.');
      return;
    }

    setFamilyCode(familyData.family_code);
    
    // Load children
    const { data: childrenData } = await supabase
      .from('children')
      .select('*')
      .eq('family_id', familyData.id)
      .order('created_at', { ascending: false });
    
    if (childrenData) {
      setChildren(childrenData);
    }

    // Load pending submissions
    loadSubmissions(familyData.id);

    // Listen for new submissions
    const channel = supabase
      .channel('submissions-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'submissions',
        filter: `family_id=eq.${familyData.id}`,
      }, () => {
        loadSubmissions(familyData.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadSubmissions = async (familyId: string) => {
    const { data } = await supabase
      .from('submissions')
      .select(`
        *,
        child:children(*)
      `)
      .eq('family_id', familyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (data) {
      setSubmissions(data as Submission[]);
    }
  };

  const handleAddChild = async () => {
    if (!newNickname || !newPin) {
      alert('닉네임과 PIN을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      // Get family
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (!familyData) throw new Error('가족 정보를 찾을 수 없습니다.');

      const { error } = await supabase
        .from('children')
        .insert({
          family_id: familyData.id,
          nickname: newNickname,
          pin: newPin,
          points: 0,
        });

      if (error) throw error;

      setNewNickname('');
      setNewPin('');
      checkAuthAndLoadData();
    } catch (error: any) {
      alert(error.message || '자녀 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'approved' })
        .eq('id', submissionId);

      if (error) throw error;

      // Points will be updated via trigger
      checkAuthAndLoadData();
    } catch (error: any) {
      alert(error.message || '승인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Remove all Supabase channels
      await supabase.removeAllChannels();
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
      
      // Clear any local storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Force navigation to login page
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      // Force navigation even if there's an error
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">ChoreMint 대시보드</h1>
              <p className="text-gray-600 mt-1">가족 코드: <span className="font-mono font-bold text-lg">{familyCode || '로딩 중...'}</span></p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-semibold text-yellow-800 mb-1">설정 필요</p>
                <p className="text-sm text-yellow-700">{error}</p>
                <p className="text-sm text-yellow-600 mt-2">
                  <strong>해결 방법:</strong> Supabase 대시보드 → SQL Editor에서 <code className="bg-yellow-100 px-2 py-1 rounded">supabase/sql/init.sql</code> 파일의 내용을 실행해주세요.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Child Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">자녀 추가</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="닉네임"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddChild}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>

          {/* Children List */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">자녀 목록</h2>
            <div className="space-y-3">
              {children.length === 0 ? (
                <p className="text-gray-500">등록된 자녀가 없습니다.</p>
              ) : (
                children.map((child) => {
                  const uploadUrl = `${window.location.origin}/upload?pin=${child.pin}`;
                  const childHomeUrl = `${window.location.origin}/child`;
                  const handleCopyLink = (url: string) => {
                    navigator.clipboard.writeText(url);
                    alert('링크가 복사되었습니다!');
                  };
                  
                  return (
                    <div key={child.id} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-lg text-gray-800">{child.nickname}</span>
                        <span className="text-blue-600 font-bold text-lg flex items-center gap-1">
                          <Icon name="star" size={18} className="md:w-5 md:h-5" />
                          {child.points}점
                        </span>
                      </div>
                      <div className="bg-white rounded-lg p-3 mb-2 space-y-2">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">📱 자녀용 바로가기 링크 (PIN 포함)</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={uploadUrl}
                              readOnly
                              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                            />
                            <button
                              onClick={() => handleCopyLink(uploadUrl)}
                              className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                            >
                              복사
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">🏠 자녀 홈페이지 링크 (PIN 직접 입력)</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={childHomeUrl}
                              readOnly
                              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                            />
                            <button
                              onClick={() => handleCopyLink(childHomeUrl)}
                              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                            >
                              복사
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-2 border border-yellow-200">
                        <p className="text-xs text-yellow-700">
                          💡 <strong>PIN:</strong> {child.pin} (자녀가 직접 입력 가능)
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Pending Submissions */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">승인 대기 목록</h2>
          {submissions.length === 0 ? (
            <p className="text-gray-500">승인 대기 중인 제출물이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {submissions.map((submission) => (
                <div key={submission.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <img
                    src={submission.photo_url}
                    alt="Submission"
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-4">
                    <p className="font-medium text-gray-800 mb-2">
                      {submission.child.nickname}
                    </p>
                    <button
                      onClick={() => handleApprove(submission.id)}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                      승인 (+10점)
                    </button>
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


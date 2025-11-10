import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ChildTabNav from '../../components/ChildTabNav';
import Icon from '../../components/Icon';

interface ChildSession {
  childId: string;
  nickname: string;
  points: number;
  familyId: string;
}

export default function ChildProfile() {
  const [childSession, setChildSession] = useState<ChildSession | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const session = localStorage.getItem('child_session');
    if (!session) {
      navigate('/child-login');
      return;
    }

    let parsedSession: ChildSession;
    try {
      parsedSession = JSON.parse(session);
      setChildSession(parsedSession);
    } catch (e) {
      navigate('/child-login');
      return;
    }

    // Subscribe to children table updates (포인트 실시간 갱신)
    const childrenChannel = supabase
      .channel('child-profile-points-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'children',
          filter: `id=eq.${parsedSession.childId}`,
        },
        (payload) => {
          console.log('Child points updated:', payload);
          // 포인트가 업데이트되면 세션과 상태 업데이트
          if (payload.new.points !== undefined) {
            const updatedSession = { ...parsedSession, points: payload.new.points };
            localStorage.setItem('child_session', JSON.stringify(updatedSession));
            setChildSession(updatedSession);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(childrenChannel);
    };
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('child_session');
    navigate('/child-login');
  };

  if (!childSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50 pb-20">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50 pb-20">
      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">프로필</h1>

          <div className="space-y-6">
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-pink-400 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl">
                {childSession.nickname[0].toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-gray-800">{childSession.nickname}</h2>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">보유 포인트</span>
                <span className="text-2xl font-bold text-blue-600 flex items-center gap-1">
                  <Icon name="star" size={20} className="md:w-6 md:h-6" />
                  {childSession.points}점
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-bold"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
      <ChildTabNav />
    </div>
  );
}


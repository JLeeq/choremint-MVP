import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';
import Icon from '../../components/Icon';

interface Child {
  id: string;
  nickname: string;
  points: number;
}

interface PointsLedger {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
  child: {
    nickname: string;
  };
}

export default function ParentRewards() {
  const [children, setChildren] = useState<Child[]>([]);
  const [pointsHistory, setPointsHistory] = useState<PointsLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/');
      return;
    }

    try {
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (familyData) {
        // Load children
        const { data: childrenData } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', familyData.id)
          .order('points', { ascending: false });

        if (childrenData) {
          setChildren(childrenData);
        }

        // Load points history
        if (childrenData && childrenData.length > 0) {
          const childIds = childrenData.map(c => c.id);
          const { data: historyData, error: historyError } = await supabase
            .from('points_ledger')
            .select(`
              *,
              child:children(nickname)
            `)
            .in('child_id', childIds)
            .order('created_at', { ascending: false })
            .limit(50);

          if (historyError) {
            console.error('Error loading points history:', historyError);
            setPointsHistory([]);
          } else if (historyData) {
            setPointsHistory(historyData as PointsLedger[]);
          } else {
            setPointsHistory([]);
          }
        } else {
          setPointsHistory([]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 pb-20">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">보상</h1>
        </div>

        {/* Children Points Summary */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <h2 className="text-xl font-bold text-gray-800 mb-4">자녀별 포인트</h2>
          {children.length === 0 ? (
            <p className="text-gray-500">등록된 자녀가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {children.map((child) => (
                <div key={child.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="font-semibold text-gray-800">{child.nickname}</span>
                  <span className="text-2xl font-bold text-blue-600 flex items-center gap-1">
                    <Icon name="star" size={20} className="md:w-6 md:h-6" />
                    {child.points}점
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Points History */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">포인트 내역</h2>
          {pointsHistory.length === 0 ? (
            <p className="text-gray-500">포인트 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pointsHistory.map((entry) => (
                <div key={entry.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{entry.child.nickname}</p>
                    <p className="text-sm text-gray-600">{entry.reason}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-lg font-bold ${entry.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.delta > 0 ? '+' : ''}{entry.delta}점
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ParentTabNav />
    </div>
  );
}


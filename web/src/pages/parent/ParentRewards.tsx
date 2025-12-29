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
        // Load children with points from child_points_view
        const { data: childrenData } = await supabase
          .from('children')
          .select('id, nickname, family_id, created_at')
          .eq('family_id', familyData.id)
          .eq('active', true);
        
        // Get points from child_points_view
        if (childrenData && childrenData.length > 0) {
          const childIds = childrenData.map(c => c.id);
          const { data: pointsData } = await supabase
            .from('child_points_view')
            .select('child_id, total_points')
            .in('child_id', childIds);
          
          // Merge points data with children data
          let childrenWithPoints: Child[] = [];
          if (pointsData) {
            const pointsMap = new Map(pointsData.map(p => [p.child_id, p.total_points]));
            childrenWithPoints = childrenData.map(child => ({
              id: child.id,
              nickname: child.nickname,
              points: pointsMap.get(child.id) || 0,
            }));
            // Sort by points
            childrenWithPoints.sort((a, b) => b.points - a.points);
          } else {
            childrenWithPoints = childrenData.map(child => ({
              id: child.id,
              nickname: child.nickname,
              points: 0,
            }));
          }

          setChildren(childrenWithPoints);
        } else {
          setChildren([]);
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
      <div className="min-h-screen flex items-center justify-center bg-white pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-4xl mx-auto p-3 sm:p-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 pt-6 sm:pt-8">Rewards</h1>

        {/* Children Points Summary */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Children Points</h2>
          {children.length === 0 ? (
            <p className="text-gray-500">No children registered.</p>
          ) : (
            <div className="space-y-3">
              {children.map((child) => (
                <div key={child.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="font-semibold text-gray-800">{child.nickname}</span>
                  <span className="text-2xl font-bold text-orange-600 flex items-center gap-1">
                    <Icon name="star" size={20} className="md:w-6 md:h-6" />
                    {child.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Points History */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Points History</h2>
          {pointsHistory.length === 0 ? (
            <p className="text-gray-500">No points history.</p>
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
                    {entry.delta > 0 ? '+' : ''}{entry.delta} pts
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


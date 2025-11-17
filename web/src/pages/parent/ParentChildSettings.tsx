import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';

interface Child {
  id: string;
  nickname: string;
  points: number;
  avatar_url?: string;
  goal_points?: number;
  reward?: string;
}

export default function ParentChildSettings() {
  const { childId } = useParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [goalPoints, setGoalPoints] = useState<number>(100);
  const [reward, setReward] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!childId) {
      navigate('/parent/home');
      return;
    }
    loadChildData();
  }, [childId, navigate]);

  const loadChildData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      // Load child data with family_id
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('id, nickname, points, avatar_url, goal_points, reward, family_id')
        .eq('id', childId)
        .single();

      if (childError) {
        console.error('Error loading child:', childError);
        alert(`Error: ${childError.message}`);
        navigate('/parent/home');
        return;
      }

      if (!childData) {
        alert('Child not found.');
        navigate('/parent/home');
        return;
      }

      // Verify child belongs to parent's family
      const { data: familyData, error: familyError } = await supabase
        .from('families')
        .select('id')
        .eq('parent_id', session.user.id)
        .single();

      if (familyError) {
        console.error('Error loading family:', familyError);
        alert(`Error: ${familyError.message}`);
        navigate('/parent/home');
        return;
      }

      if (!familyData) {
        alert('Family not found.');
        navigate('/parent/home');
        return;
      }

      if (childData.family_id !== familyData.id) {
        alert('You do not have permission to view this child.');
        navigate('/parent/home');
        return;
      }

      setChild(childData);
      setGoalPoints(childData.goal_points || 100);
      setReward(childData.reward || '');
    } catch (error) {
      console.error('Error loading child data:', error);
      alert('Failed to load child data.');
      navigate('/parent/home');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!childId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('children')
        .update({
          goal_points: goalPoints,
          reward: reward.trim() || null,
        })
        .eq('id', childId);

      if (error) throw error;

      alert('Settings saved!');
      navigate('/parent/home');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      alert(error.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!child) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate('/parent/home')}
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-[#5CE1C6] overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center">
                {child.avatar_url ? (
                  <img
                    src={child.avatar_url}
                    alt={child.nickname}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-bold text-white">
                    {child.nickname[0].toUpperCase()}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-800">{child.nickname}'s Settings</h1>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Goal Points (목표 포인트)
              </label>
              <input
                type="number"
                min="1"
                value={goalPoints}
                onChange={(e) => setGoalPoints(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5CE1C6]"
                placeholder="Enter goal points"
              />
              <p className="text-xs text-gray-500 mt-1">
                Current points: {child.points} / {goalPoints}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reward (보상)
              </label>
              <textarea
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5CE1C6] min-h-[100px]"
                placeholder="Enter reward description (e.g., 'Ice cream', 'New toy', 'Extra screen time')"
              />
              <p className="text-xs text-gray-500 mt-1">
                This reward will be shown to the child when they reach the goal.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-[#5CE1C6] text-white rounded-lg hover:bg-[#4BC9B0] transition-colors disabled:opacity-50 font-bold"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => navigate('/parent/home')}
                className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
      <ParentTabNav />
    </div>
  );
}


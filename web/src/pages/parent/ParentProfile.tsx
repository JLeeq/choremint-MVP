import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';

interface Family {
  id: string;
  family_code: string;
}

export default function ParentProfile() {
  const [family, setFamily] = useState<Family | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [notifOptIn, setNotifOptIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      // Load or create profile
      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (!profileData) {
        // Create profile if doesn't exist
        const { data: familyData } = await supabase
          .from('families')
          .select('*')
          .eq('parent_id', session.user.id)
          .single();

        if (familyData) {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              user_id: session.user.id,
              name: session.user.email?.split('@')[0] || '부모',
              role: 'parent',
              family_id: familyData.id,
              notif_opt_in: true,
            })
            .select()
            .single();

          profileData = newProfile;
        }
      }

      if (profileData) {
        setFamilyName(profileData.name);
        setNotifOptIn(profileData.notif_opt_in);

        // Load family
        if (profileData.family_id) {
          const { data: familyData } = await supabase
            .from('families')
            .select('*')
            .eq('id', profileData.family_id)
            .single();

          if (familyData) {
            setFamily(familyData);
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      const { error } = await supabase
        .from('profiles')
        .update({
          name: familyName,
          notif_opt_in: notifOptIn,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.user.id);

      if (error) throw error;

      alert('프로필이 저장되었습니다!');
      loadData();
    } catch (error: any) {
      alert(error.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
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
          <h1 className="text-2xl font-bold text-gray-800 mb-6">프로필</h1>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                가족명
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                가족 코드
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={family?.family_code || ''}
                  readOnly
                  className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(family?.family_code || '');
                    alert('가족 코드가 복사되었습니다!');
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  복사
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-semibold text-gray-800">알림 수신</p>
                <p className="text-sm text-gray-600">푸시 알림을 받으시겠습니까?</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifOptIn}
                  onChange={(e) => setNotifOptIn(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-bold"
              >
                저장
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-bold"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>
      <ParentTabNav />
    </div>
  );
}


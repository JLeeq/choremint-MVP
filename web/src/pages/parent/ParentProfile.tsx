import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';

interface Family {
  id: string;
  family_code: string;
  family_name?: string;
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
              name: session.user.email?.split('@')[0] || 'Parent',
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
            // Set family_name if it exists, otherwise use profile name
            if (familyData.family_name) {
              setFamilyName(familyData.family_name);
            } else if (profileData.name) {
              setFamilyName(profileData.name);
            }
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
      if (!session) throw new Error('Login required.');

      // Update family_name in families table
      if (family) {
        const { error: familyError } = await supabase
          .from('families')
          .update({
            family_name: familyName,
          })
          .eq('id', family.id);

        if (familyError) throw familyError;
      }

      // Update profile
      const { error } = await supabase
        .from('profiles')
        .update({
          name: familyName,
          notif_opt_in: notifOptIn,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.user.id);

      if (error) throw error;

      alert('Profile saved!');
      loadData();
    } catch (error: any) {
      alert(error.message || 'Error occurred while saving.');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Profile</h1>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Family Name (This will appear as "~'s Home" on the home page)
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="Enter family name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5CE1C6]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Family Code
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
                    alert('Family code copied!');
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-semibold text-gray-800">Notifications</p>
                <p className="text-sm text-gray-600">Receive push notifications?</p>
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
                Save
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-bold"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
      <ParentTabNav />
    </div>
  );
}


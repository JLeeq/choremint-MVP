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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const session = localStorage.getItem('child_session');
    if (!session) {
      navigate('/');
      return;
    }

    let parsedSession: ChildSession;
    try {
      parsedSession = JSON.parse(session);
      setChildSession(parsedSession);
    } catch (e) {
      navigate('/');
      return;
    }

    // Load child's avatar_url (optional, don't fail if it errors)
    const loadAvatar = async () => {
      try {
        const { data: childData, error: childError } = await supabase
          .from('children')
          .select('avatar_url')
          .eq('id', parsedSession.childId)
          .single();
        
        if (!childError && childData?.avatar_url) {
          setAvatarUrl(childData.avatar_url);
        }
      } catch (avatarError) {
        // Silently fail - avatar is optional
        console.log('Could not load avatar:', avatarError);
      }
    };
    loadAvatar();

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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !childSession) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB.');
        return;
      }

      setUploading(true);

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${childSession.childId}-${Date.now()}.${fileExt}`;
      const filePath = `child-avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update child's avatar_url
      const { error: updateError } = await supabase
        .from('children')
        .update({ avatar_url: publicUrl })
        .eq('id', childSession.childId);

      if (updateError) {
        console.error('Database update error:', updateError);
        throw new Error(`Failed to update profile: ${updateError.message}`);
      }

      setAvatarUrl(publicUrl);
      alert('Profile picture updated!');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      alert(error.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-white pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Profile</h1>

          <div className="space-y-6">
            <div className="text-center">
              <div className="relative w-24 h-24 mx-auto mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#5CE1C6] bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={childSession.nickname}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-bold text-white">
                      {childSession.nickname[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <label className="absolute bottom-0 right-0 w-8 h-8 bg-[#5CE1C6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#4BC9B0] transition-colors shadow-lg">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </label>
              </div>
              <h2 className="text-xl font-bold text-gray-800">{childSession.nickname}</h2>
              {uploading && (
                <p className="text-sm text-gray-500 mt-2">Uploading...</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Total Points</span>
                <span className="text-2xl font-bold text-blue-600 flex items-center gap-1">
                  <Icon name="star" size={20} className="md:w-6 md:h-6" />
                  {childSession.points} pts
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-bold"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      <ChildTabNav />
    </div>
  );
}


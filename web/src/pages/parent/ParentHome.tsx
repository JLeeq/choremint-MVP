import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';
import { initializePushNotifications } from '../../lib/pushNotifications';

interface Family {
  id: string;
  family_code: string;
  family_name?: string;
}

interface Child {
  id: string;
  nickname: string;
  points: number;
  avatar_url?: string;
  goal_points?: number | null;
  reward?: string | null;
}


export default function ParentHome() {
  const [family, setFamily] = useState<Family | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [parentName, setParentName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newPin, setNewPin] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [familyNameOnboarding, setFamilyNameOnboarding] = useState('');
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [showChildModal, setShowChildModal] = useState(false);
  const [childGoalPoints, setChildGoalPoints] = useState<number>(100);
  const [childReward, setChildReward] = useState<string>('');
  const [savingChild, setSavingChild] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChild, setDeletingChild] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsFamilyName, setSettingsFamilyName] = useState('');
  const [notifOptIn, setNotifOptIn] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  // 푸시 알림 초기화
  useEffect(() => {
    const initPush = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // 부모 로그인 시 푸시 알림 구독
        await initializePushNotifications(session.user.id, false);
      }
    };
    initPush();
  }, []);

  useEffect(() => {
    if (!family) return;
    
    // Subscribe to new submissions with family_id filter
    const submissionsChannel = supabase
      .channel('parent-home-submissions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `family_id=eq.${family.id}`,
        },
        (payload) => {
          console.log('New submission received:', payload);
          loadSubmissions(family.id);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to submissions');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Channel error:', status);
        }
      });

    // Subscribe to points_ledger updates to refresh children points
    const pointsLedgerChannel = supabase
      .channel('parent-home-points-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'points_ledger',
        },
        (payload) => {
          console.log('Points ledger updated:', payload);
          // 포인트가 변경되면 데이터 다시 로드
          loadData();
        }
      )
      .subscribe();

    // Subscribe to families table updates (for family_name changes)
    const familiesChannel = supabase
      .channel('parent-home-families-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'families',
          filter: `id=eq.${family.id}`,
        },
        (payload) => {
          console.log('Family updated:', payload);
          // family_name이 변경되면 데이터 다시 로드
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(pointsLedgerChannel);
      supabase.removeChannel(familiesChannel);
    };
  }, [family]);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/');
      return;
    }

    try {
      console.log('Loading family for user:', session.user.id);
      // Load family with family_name
      const { data: familyData, error: familyError } = await supabase
        .from('families')
        .select('id, family_code, family_name')
        .eq('parent_id', session.user.id)
        .single();
      
      console.log('Family query result:', { familyData, familyError });

      if (familyError) {
        console.error('Error loading family:', familyError);
        
        // PGRST116 에러는 데이터가 없다는 의미이므로 가족 생성 시도
        if (familyError.code === 'PGRST116') {
          console.log('Family not found, creating new family...');
        } else {
          console.error('Unexpected error loading family:', familyError);
          alert(`가족 정보를 불러오는 중 오류가 발생했습니다: ${familyError.message}`);
          setLoading(false);
          return;
        }
        
        // Try to create family if it doesn't exist
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          console.log('Calling ensure_family_exists RPC...');
          const { data: newFamilyId, error: createError } = await supabase.rpc(
            'ensure_family_exists',
            { user_id: currentSession.user.id }
          );
          
          console.log('RPC result:', { newFamilyId, createError });
          if (createError) {
            console.error('Error creating family:', createError);
            // Fallback: Try to create family manually
            const familyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const { data: newFamily, error: insertError } = await supabase
              .from('families')
              .insert({
                parent_id: currentSession.user.id,
                family_code: familyCode,
              })
              .select()
              .single();
            
            if (insertError) {
              console.error('Error creating family manually:', insertError);
              setLoading(false);
              return;
            }
            
            if (newFamily) {
              setFamily(newFamily);
              await loadChildrenAndData(newFamily.id);
              setLoading(false);
              return;
            }
          } else if (newFamilyId) {
            // Reload family
            const { data: reloadedFamily, error: reloadError } = await supabase
              .from('families')
              .select('*')
              .eq('parent_id', session.user.id)
              .single();
            
            if (reloadError) {
              console.error('Error reloading family:', reloadError);
              setLoading(false);
              return;
            }
            
            if (reloadedFamily) {
              setFamily(reloadedFamily);
              await loadChildrenAndData(reloadedFamily.id);
              setLoading(false);
              return;
            }
          }
        }
        setLoading(false);
        return;
      }

      if (familyData) {
        console.log('Family found:', familyData);
        setFamily(familyData);
        
        // Check if profile exists
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (!profileData) {
          // Show onboarding modal
          setShowOnboarding(true);
          setLoading(false);
          return;
        }

        // Set parent name from profile
        if (profileData.name) {
          setParentName(profileData.name);
        } else {
          // Fallback to email username if name not set
          setParentName(session.user.email?.split('@')[0] || 'Parent');
        }

        await loadChildrenAndData(familyData.id);
      } else {
        console.log('Family data is null, trying to create...');
        // Family doesn't exist, try to create
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          const { data: newFamilyId, error: createError } = await supabase.rpc(
            'ensure_family_exists',
            { user_id: currentSession.user.id }
          );
          if (createError) {
            console.error('RPC create error:', createError);
            // Fallback: manual creation
            const familyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const { data: newFamily, error: insertError } = await supabase
              .from('families')
              .insert({
                parent_id: currentSession.user.id,
                family_code: familyCode,
              })
              .select()
              .single();
            
            if (insertError) {
              console.error('Manual create error:', insertError);
              alert(`가족 생성 중 오류가 발생했습니다: ${insertError.message}`);
            } else if (newFamily) {
              setFamily(newFamily);
              await loadChildrenAndData(newFamily.id);
            }
          } else if (newFamilyId) {
            const { data: reloadedFamily, error: reloadError } = await supabase
              .from('families')
              .select('*')
              .eq('parent_id', session.user.id)
              .single();
            
            if (reloadError) {
              console.error('Reload error:', reloadError);
            } else if (reloadedFamily) {
              setFamily(reloadedFamily);
              await loadChildrenAndData(reloadedFamily.id);
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

  const loadChildrenAndData = async (familyId: string) => {
    try {
      console.log('Loading children for family:', familyId);
      // Load children with points from child_points_view (only active children)
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, nickname, family_id, created_at, avatar_url, goal_points, reward')
        .eq('family_id', familyId)
        .eq('active', true)  // Only show active children
        .order('created_at', { ascending: false });

      if (childrenError) {
        console.error('Error loading children:', childrenError);
        setChildren([]);
      } else if (childrenData && childrenData.length > 0) {
        // Get points from child_points_view
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
              avatar_url: child.avatar_url,
              goal_points: child.goal_points,
              reward: child.reward,
            }));
          } else {
            childrenWithPoints = childrenData.map(child => ({
              id: child.id,
              nickname: child.nickname,
              points: 0,
              avatar_url: child.avatar_url,
              goal_points: child.goal_points,
              reward: child.reward,
            }));
          }
        
        console.log('Children loaded:', childrenWithPoints.length);
        setChildren(childrenWithPoints);
      } else {
        console.log('No children found');
        setChildren([]);
      }

      // Load pending submissions
      await loadSubmissions(familyId);
      
      // Load incomplete and completed counts
      await loadChoreCounts(familyId);
      
      // Load weekly points (will be called again in useEffect when children are loaded)
    } catch (error) {
      console.error('Error loading children and data:', error);
      alert(`데이터를 불러오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  const loadChoreCounts = async (familyId: string) => {
    try {
      // Get all active children IDs for this family
      const { data: childrenData } = await supabase
        .from('children')
        .select('id')
        .eq('family_id', familyId)
        .eq('active', true);

      if (!childrenData || childrenData.length === 0) {
        setIncompleteCount(0);
        setCompletedCount(0);
        return;
      }

      const childIds = childrenData.map(c => c.id);
      const today = new Date().toISOString().split('T')[0];

      // Count incomplete: status='todo' AND due_date < today
      const { count: incomplete, error: incompleteError } = await supabase
        .from('chore_assignments')
        .select('*', { count: 'exact', head: true })
        .in('child_id', childIds)
        .eq('status', 'todo')
        .lt('due_date', today);

      if (incompleteError) {
        console.error('Error loading incomplete count:', incompleteError);
      } else {
        setIncompleteCount(incomplete || 0);
      }

      // Count completed: status='done'
      const { count: completed, error: completedError } = await supabase
        .from('chore_assignments')
        .select('*', { count: 'exact', head: true })
        .in('child_id', childIds)
        .eq('status', 'done');

      if (completedError) {
        console.error('Error loading completed count:', completedError);
      } else {
        setCompletedCount(completed || 0);
      }
    } catch (error) {
      console.error('Error loading chore counts:', error);
      setIncompleteCount(0);
      setCompletedCount(0);
    }
  };

  const loadSubmissions = async (familyId?: string) => {
    if (!familyId && !family) return;
    
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('id')
        .eq('family_id', familyId || family!.id)
        .eq('status', 'pending');

      if (error) {
        console.error('Error loading submissions:', error);
        setPendingCount(0);
        return;
      }

      if (data) {
        setPendingCount(data.length);
      } else {
        setPendingCount(0);
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
      setPendingCount(0);
    }
  };

  // const copyFamilyCode = () => {
  //   if (family?.family_code) {
  //     navigator.clipboard.writeText(family.family_code);
  //     alert('Family code copied!');
  //   }
  // };

  const handleOnboardingSubmit = async () => {
    if (!familyNameOnboarding.trim() || !family) return;
    
    setSavingOnboarding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Create profile with email username as default name
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: session.user.id,
          name: session.user.email?.split('@')[0] || 'Parent',
          role: 'parent',
          family_id: family.id,
          notif_opt_in: true,
        });

      if (profileError) throw profileError;

      // Update family_name
      const { error: familyError } = await supabase
        .from('families')
        .update({ family_name: familyNameOnboarding.trim() })
        .eq('id', family.id);

      if (familyError) throw familyError;

      setShowOnboarding(false);
      // Reload data
      await loadData();
    } catch (error: any) {
      console.error('Error saving onboarding:', error);
      alert('Error occurred while saving: ' + error.message);
    } finally {
      setSavingOnboarding(false);
    }
  };

  const handleAddChild = async () => {
    if (!newNickname || !newPin) {
      alert('Please enter both nickname and PIN.');
      return;
    }

    setAddingChild(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        throw new Error('Login required.');
      }

      if (!family) {
        console.error('Family is null:', family);
        throw new Error('Family information not found. Please refresh the page.');
      }

      console.log('Adding child with:', { 
        family_id: family.id, 
        nickname: newNickname, 
        pin: newPin 
      });

      const { data, error } = await supabase
        .from('children')
        .insert({
          family_id: family.id,
          nickname: newNickname,
          pin: newPin,
          points: 0,
        })
        .select();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Child added successfully:', data);

      setNewNickname('');
      setNewPin('');
      setShowAddChild(false);
      
      // Reload data to show new child
      await loadData();
      
      alert('Child added successfully!');
    } catch (error: any) {
      console.error('Error adding child:', error);
      const errorMessage = error.message || error.details || 'Error occurred while adding child.';
      alert(`Failed to add child: ${errorMessage}\n\nPlease check:\n1. You are logged in\n2. Family information is loaded\n3. Browser console for details`);
    } finally {
      setAddingChild(false);
    }
  };

  const handleSaveChildSettings = async () => {
    if (!selectedChild) return;

    setSavingChild(true);
    try {
      const { error } = await supabase
        .from('children')
        .update({
          goal_points: childGoalPoints,
          reward: childReward.trim() || null,
        })
        .eq('id', selectedChild.id);

      if (error) throw error;

      // Reload data to update children list
      await loadData();
      setShowChildModal(false);
      setSelectedChild(null);
    } catch (error: any) {
      console.error('Error saving child settings:', error);
      alert(error.message || 'Failed to save settings.');
    } finally {
      setSavingChild(false);
    }
  };

  const handleDeleteChild = async () => {
    if (!selectedChild) return;

    setDeletingChild(true);
    try {
      // Soft delete: set active to false
      const { error } = await supabase
        .from('children')
        .update({ active: false })
        .eq('id', selectedChild.id);

      if (error) throw error;

      // Reload data to update children list
      await loadData();
      setShowDeleteConfirm(false);
      setShowChildModal(false);
      setSelectedChild(null);
      alert('Child deleted successfully.');
    } catch (error: any) {
      console.error('Error deleting child:', error);
      alert(error.message || 'Failed to delete child.');
    } finally {
      setDeletingChild(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  // incompleteCount and completedCount are now loaded from state

  return (
    /* DESIGN SYSTEM: Home Screen Layout
       ============================================
       전체 레이아웃:
       1. 배경: 따뜻한 크림톤 (#FFF8F0)
       2. 컨테이너: max-w-4xl mx-auto (중앙 정렬, 최대 너비 제한)
       3. 섹션 구조:
          - Welcome Header (크림 배경)
          - Today Status Section (흰색 카드)
          - Children's Progress Section (흰색 카드)
       
       재사용 가능한 디자인 패턴:
       - Section Card: bg-white rounded-2xl p-5 sm:p-6 (섹션 컨테이너)
       - Status Grid: grid grid-cols-3 gap-3 (3열 상태 카드 그리드)
       - Status Card: aspect-square, 중앙 정렬 아이콘+라벨+숫자
       - List Item with Avatar: flex items-center gap-4 (아바타+내용 가로 배치)
       - Progress Bar: bg-gray-200 + bg-[#F8D79F] (오렌지 진행바)
    */
    <div className="min-h-screen bg-[#B2F5EA] pb-20">
      {/* Add Child Modal */}
      {showAddChild && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/20 flex items-center justify-center z-50 p-4 pointer-events-none">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full px-5 py-6 sm:p-6 max-h-[80vh] overflow-y-auto pointer-events-auto my-2 mx-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex justify-between items-start mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex-1 pr-2">
                Add New Child
              </h2>
              <button
                onClick={() => {
                  setShowAddChild(false);
                  setNewNickname('');
                  setNewPin('');
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center min-h-[44px] flex-shrink-0"
              >
                ×
              </button>
            </div>
            <div className="space-y-5 pb-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nickname *
                </label>
                <input
                  type="text"
                  placeholder="Enter nickname"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  PIN *
                </label>
                <input
                  type="text"
                  placeholder="Enter PIN"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowAddChild(false);
                    setNewNickname('');
                    setNewPin('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddChild}
                  disabled={addingChild || !newNickname || !newPin}
                  className="flex-1 px-4 py-2 bg-[#1E3A8A] text-white rounded-lg hover:bg-[#2563EB] transition-colors disabled:opacity-50 font-medium min-h-[44px]"
                >
                  {addingChild ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Child Settings Modal */}
      {showChildModal && selectedChild && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/20 flex items-center justify-center z-50 p-4 pointer-events-none">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full px-5 py-6 sm:p-6 max-h-[80vh] overflow-y-auto pointer-events-auto my-2 mx-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-3 flex-1 pr-2">
                <div className="w-12 h-12 rounded-full border-2 border-orange-500 overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                  {selectedChild.avatar_url ? (
                    <img
                      src={selectedChild.avatar_url}
                      alt={selectedChild.nickname}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-bold text-white">
                      {selectedChild.nickname[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
                  {selectedChild.nickname}&apos;s Settings
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowChildModal(false);
                  setSelectedChild(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center min-h-[44px] flex-shrink-0"
              >
                ×
              </button>
            </div>
            <div className="space-y-5 pb-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Goal Points (목표 포인트)
                </label>
                <input
                  type="number"
                  min="1"
                  value={childGoalPoints}
                  onChange={(e) => setChildGoalPoints(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F]"
                  placeholder="Enter goal points"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Current points: {selectedChild.points} / {childGoalPoints}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reward (보상)
                </label>
                <textarea
                  value={childReward}
                  onChange={(e) => setChildReward(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F] min-h-[100px]"
                  placeholder="Enter reward description (e.g., 'Ice cream', 'New toy', 'Extra screen time')"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This reward will be shown to the child when they reach the goal.
                </p>
              </div>

              {/* Delete Child Button */}
              <div className="pt-4 border-t border-gray-200 mt-4">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium min-h-[44px] flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Child
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowChildModal(false);
                    setSelectedChild(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChildSettings}
                  disabled={savingChild}
                  className="flex-1 px-4 py-2 bg-[#F8D79F] text-gray-800 rounded-lg hover:bg-[#F6D08A] transition-colors disabled:opacity-50 font-medium min-h-[44px]"
                >
                  {savingChild ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedChild && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/30 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full px-6 py-6 pointer-events-auto">
            <div className="text-center mb-6">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Delete {selectedChild.nickname}?
              </h3>
              <p className="text-gray-600 text-sm">
                Are you sure you want to delete this child?
                <br />
                All chores and progress will be removed.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingChild}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[44px] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChild}
                disabled={deletingChild}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingChild ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Welcome! 👋
            </h2>
            <p className="text-gray-600 mb-6">
              Please set your family name to get started.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Family Name *
                </label>
                <input
                  type="text"
                  value={familyNameOnboarding}
                  onChange={(e) => setFamilyNameOnboarding(e.target.value)}
                  placeholder="e.g., Smith"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will appear as "~'s Home" on the home page
                </p>
              </div>
              
              <button
                onClick={handleOnboardingSubmit}
                disabled={savingOnboarding || !familyNameOnboarding.trim()}
                className="w-full px-6 py-3 bg-[#F8D79F] text-gray-800 rounded-lg hover:bg-[#F6D08A] transition-colors disabled:opacity-50 font-bold"
              >
                {savingOnboarding ? 'Saving...' : 'Get Started'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSettingsModal(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Profile</h1>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Family Name
                </label>
                <input
                  type="text"
                  value={settingsFamilyName}
                  onChange={(e) => setSettingsFamilyName(e.target.value)}
                  placeholder="Enter family name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F]"
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
                    className="px-4 py-2 bg-[#B2F5EA] text-gray-800 rounded-lg hover:bg-[#A8E6CF] transition-colors"
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
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#F8D79F]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#F8D79F]"></div>
                </label>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) throw new Error('Login required.');

                      // Update family_name in families table
                      if (family) {
                        const { error: familyError } = await supabase
                          .from('families')
                          .update({
                            family_name: settingsFamilyName,
                          })
                          .eq('id', family.id);

                        if (familyError) throw familyError;
                      }

                      // Update profile
                      const { error } = await supabase
                        .from('profiles')
                        .update({
                          name: settingsFamilyName,
                          notif_opt_in: notifOptIn,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('user_id', session.user.id);

                      if (error) throw error;

                      // Update local state
                      if (family) {
                        setFamily({ ...family, family_name: settingsFamilyName });
                      }
                      setParentName(settingsFamilyName);

                      alert('Profile saved!');
                      setShowSettingsModal(false);
                    } catch (error: any) {
                      alert(error.message || 'Error occurred while saving.');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  disabled={savingSettings}
                  className="flex-1 px-6 py-3 bg-[#B2F5EA] text-gray-800 rounded-lg hover:bg-[#A8E6CF] transition-colors disabled:opacity-50 font-bold"
                >
                  Save
                </button>
                <button
                  onClick={async () => {
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
                  }}
                  className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-bold"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-6 sm:pt-8 pb-6">
        {/* Welcome Header */}
        {/* DESIGN PATTERN: Page Header - 재사용 가능한 헤더 스타일
            - 큰 제목 (text-2xl sm:text-3xl) + 작은 서브텍스트 구조
            - 크림 배경 위에서 따뜻한 느낌 유지 */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
                Hi, {parentName || 'Family'}!
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Check today&apos;s status!
              </p>
            </div>
            <button
              onClick={() => {
                // Load settings data when opening modal
                const loadSettingsData = async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) return;

                  try {
                    const { data: profileData } = await supabase
                      .from('profiles')
                      .select('*')
                      .eq('user_id', session.user.id)
                      .single();

                    if (profileData) {
                      setSettingsFamilyName(profileData.name || family?.family_name || '');
                      setNotifOptIn(profileData.notif_opt_in ?? true);
                    } else if (family?.family_name) {
                      setSettingsFamilyName(family.family_name);
                    }
                  } catch (error) {
                    console.error('Error loading settings data:', error);
                  }
                };
                loadSettingsData();
                setShowSettingsModal(true);
              }}
              className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              aria-label="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Today Status Section - 흰색 rounded rectangle 배경 카드 */}
        {/* DESIGN PATTERN: Section Card - 재사용 가능한 섹션 컨테이너
            - bg-white rounded-2xl: 흰색 배경 + 둥근 모서리
            - p-5 sm:p-6: 넉넉한 패딩
            - mb-6: 섹션 간 간격 */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 mb-6">
          {/* DESIGN PATTERN: Status Grid Cards - 재사용 가능한 상태 카드 그리드
              - grid grid-cols-3 gap-3: 3열 그리드, 균등 간격
              - aspect-square: 정사각형 비율 유지
              - 아이콘(위) + 라벨(중) + 숫자(아래) 세로 정렬 구조 */}
          <div className="grid grid-cols-3 gap-3">
            {/* DESIGN PATTERN: Status Card - 재사용 가능한 개별 상태 카드
                - flex flex-col items-center justify-center: 중앙 정렬
                - cursor-pointer transition-all hover:shadow-md: 인터랙션 피드백
                - 아이콘 색상별 의미 구분 (주황=대기, 회색=미완료, 초록=완료) */}
            {/* To Approve Card */}
            <div 
              onClick={() => navigate('/parent/approvals')}
              className="bg-white rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-center aspect-square border border-gray-100"
            >
              <div className="mb-2 w-8 h-8 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="text-xs text-gray-600 mb-1">To Approve</p>
              <p className="text-2xl font-bold text-[#FF6B35]">{pendingCount}</p>
            </div>

            {/* Incomplete Card */}
            <div 
              onClick={() => navigate('/parent/chores')}
              className="bg-white rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-center aspect-square border border-gray-100"
            >
              <div className="mb-2 w-8 h-8 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </div>
              <p className="text-xs text-gray-600 mb-1">Incomplete</p>
              <p className="text-2xl font-bold text-gray-500">{incompleteCount}</p>
            </div>

            {/* Completed Card */}
            <div 
              onClick={() => navigate('/parent/approvals')}
              className="bg-white rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-center aspect-square border border-gray-100"
            >
              <div className="mb-2 w-8 h-8 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="text-xs text-gray-600 mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-500">{completedCount}</p>
            </div>
          </div>
        </div>

        {/* Children's Progress Section - 흰색 rounded rectangle 배경 카드 */}
        {/* DESIGN PATTERN: Section Card - 재사용 가능한 섹션 컨테이너
            - bg-white rounded-2xl: 흰색 배경 + 둥근 모서리
            - p-5 sm:p-6: 넉넉한 패딩 */}
        <div className="bg-white rounded-2xl p-5 sm:p-6">
          {/* DESIGN PATTERN: Section Header with Action - 재사용 가능한 섹션 헤더 (제목 + 액션 버튼)
              - flex items-center justify-between: 제목과 버튼 양쪽 정렬
              - mb-4: 내용과의 적절한 간격 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Children&apos;s Progress</h2>
            {/* DESIGN PATTERN: Secondary Action Button - 재사용 가능한 보조 액션 버튼
                - 주황색 계열 (앱의 포인트 컬러)
                - 작은 크기, 보조 액션 느낌
                - border 스타일로 Primary 버튼처럼 튀지 않게 */}
            <button
              onClick={() => setShowAddChild(true)}
              className="px-3 py-1.5 border border-[#1E3A8A] text-[#1E3A8A] rounded-lg hover:bg-[#1E3A8A]/20 transition-colors text-xs font-medium flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Child
            </button>
          </div>
          {children.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No children registered.</p>
          ) : (
            <div className="space-y-4">
              {children.map((child) => {
                // Calculate progress based on goal_points
                const goalPoints = child.goal_points || 100; // Default to 100 if no goal set
                const progress = goalPoints > 0 
                  ? Math.min(100, (child.points / goalPoints) * 100)
                  : 0;
                return (
                  /* DESIGN PATTERN: List Item with Avatar - 재사용 가능한 리스트 아이템
                      - flex items-center gap-4: 아바타 + 내용 가로 배치
                      - cursor-pointer hover:bg-gray-50: 인터랙션 피드백
                      - -mx-2 px-2 py-2: 패딩을 이용한 호버 영역 확장 */
                  <div 
                    key={child.id} 
                    id={`child-${child.id}`}
                    className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-2 rounded-xl transition-colors"
                    onClick={() => {
                      setSelectedChild(child);
                      setChildGoalPoints(child.goal_points || 100);
                      setChildReward(child.reward || '');
                      setShowChildModal(true);
                    }}
                  >
                    {/* DESIGN PATTERN: Avatar Circle - 재사용 가능한 아바타
                        - rounded-full: 원형
                        - border-2 border-gray-200: 얇은 테두리
                        - bg-gradient-to-br from-orange-400 to-pink-400: 그라데이션 배경 (이미지 없을 때)
                        - flex-shrink-0: 아바타 크기 고정 */}
                    {/* Child Avatar */}
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-gray-200 overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                      {child.avatar_url ? (
                        <img
                          src={child.avatar_url}
                          alt={child.nickname}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg sm:text-xl font-bold text-white">
                          {child.nickname[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    
                    {/* DESIGN PATTERN: Progress Card Content - 재사용 가능한 진행 상황 카드 내용
                        - flex-1 min-w-0: 남은 공간 차지 + 텍스트 오버플로우 처리
                        - 이름 + 포인트 (상단), 목표 (중간), 진행바 (하단) 세로 배치 */}
                    {/* Child Info and Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-800 text-base sm:text-lg">{child.nickname}</span>
                        <span className="text-sm text-gray-600 whitespace-nowrap ml-2">
                          {child.points} / {goalPoints} points
                        </span>
                      </div>
                      {child.reward && (
                        <p className="text-xs sm:text-sm text-gray-500 mb-2 truncate">Goal: {child.reward}</p>
                      )}
                      {/* DESIGN PATTERN: Progress Bar - 재사용 가능한 진행바
                          - bg-gray-200 rounded-full: 배경 바
                          - bg-[#1E3A8A]: 진행률 표시 (남색)
                          - transition-all duration-300: 부드러운 애니메이션 */}
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-[#1E3A8A] h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ParentTabNav />
    </div>
  );
}


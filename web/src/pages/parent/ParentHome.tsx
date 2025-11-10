import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';
import { initializePushNotifications } from '../../lib/pushNotifications';

interface Family {
  id: string;
  family_code: string;
}

interface Child {
  id: string;
  nickname: string;
  points: number;
}


export default function ParentHome() {
  const [family, setFamily] = useState<Family | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [weeklyPoints, setWeeklyPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newPin, setNewPin] = useState('');
  const [addingChild, setAddingChild] = useState(false);
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
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
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
      // Load family
      const { data: familyData, error: familyError } = await supabase
        .from('families')
        .select('*')
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
      // Load children
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });

      if (childrenError) {
        console.error('Error loading children:', childrenError);
        setChildren([]);
      } else if (childrenData) {
        console.log('Children loaded:', childrenData.length);
        setChildren(childrenData);
      } else {
        console.log('No children found');
        setChildren([]);
      }

      // Load pending submissions
      await loadSubmissions(familyId);
      
      // Load weekly points (will be called again in useEffect when children are loaded)
    } catch (error) {
      console.error('Error loading children and data:', error);
      alert(`데이터를 불러오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
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

  const loadWeeklyPoints = async () => {
    if (children.length === 0) {
      setWeeklyPoints(0);
      return;
    }
    
    try {
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const childIds = children.map(c => c.id);
      if (childIds.length === 0) {
        setWeeklyPoints(0);
        return;
      }

      const { data, error } = await supabase
        .from('points_ledger')
        .select('delta')
        .gte('created_at', startOfWeek.toISOString())
        .in('child_id', childIds);

      if (error) {
        console.error('Error loading weekly points:', error);
        setWeeklyPoints(0);
        return;
      }

      if (data) {
        const total = data.reduce((sum, item) => sum + item.delta, 0);
        setWeeklyPoints(total);
      } else {
        setWeeklyPoints(0);
      }
    } catch (error) {
      console.error('Error loading weekly points:', error);
      setWeeklyPoints(0);
    }
  };

  useEffect(() => {
    if (children.length > 0 && family) {
      loadWeeklyPoints();
    }
  }, [children, family]);

  const copyFamilyCode = () => {
    if (family?.family_code) {
      navigator.clipboard.writeText(family.family_code);
      alert('가족 코드가 복사되었습니다!');
    }
  };

  const handleAddChild = async () => {
    if (!newNickname || !newPin) {
      alert('닉네임과 PIN을 모두 입력해주세요.');
      return;
    }

    setAddingChild(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      if (!family) throw new Error('가족 정보를 찾을 수 없습니다.');

      const { error } = await supabase
        .from('children')
        .insert({
          family_id: family.id,
          nickname: newNickname,
          pin: newPin,
          points: 0,
        });

      if (error) throw error;

      setNewNickname('');
      setNewPin('');
      setShowAddChild(false);
      loadData();
    } catch (error: any) {
      alert(error.message || '자녀 추가 중 오류가 발생했습니다.');
    } finally {
      setAddingChild(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
          <p className="text-sm text-gray-500 mt-2">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">홈</h1>
              <p className="text-gray-600 text-sm mt-1">가족 코드: 
                <span className="font-mono font-bold ml-2">{family?.family_code || '로딩 중...'}</span>
              </p>
            </div>
            <button
              onClick={copyFamilyCode}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
            >
              복사
            </button>
          </div>
          <button
            onClick={() => setShowAddChild(!showAddChild)}
            className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
          >
            {showAddChild ? '취소' : '+ 자녀 추가'}
          </button>
          {showAddChild && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
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
                disabled={addingChild}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {addingChild ? '추가 중...' : '추가'}
              </button>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* 승인 대기 */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">승인 대기</p>
                <p className="text-3xl font-bold text-blue-600">{pendingCount}건</p>
              </div>
              <button
                onClick={() => navigate('/parent/approvals')}
                className="text-4xl">✅</button>
            </div>
          </div>

          {/* 이번주 지급합계 */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">이번주 지급합계</p>
                <p className="text-3xl font-bold text-green-600">{weeklyPoints}점</p>
              </div>
              <span className="text-4xl">💰</span>
            </div>
          </div>
        </div>

        {/* 자녀별 진행 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">자녀별 진행</h2>
          {children.length === 0 ? (
            <p className="text-gray-500 text-center py-8">등록된 자녀가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {children.map((child) => {
                const progress = Math.min(100, (child.points / 100) * 100); // 예시: 100점 = 100%
                return (
                  <div key={child.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800">{child.nickname}</span>
                      <span className="text-sm text-gray-600">{child.points}점</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
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


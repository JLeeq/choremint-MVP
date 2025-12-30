import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ChildTabNav from '../../components/ChildTabNav';
import Icon from '../../components/Icon';
import { initializePushNotifications } from '../../lib/pushNotifications';

interface ChoreStep {
  order: number;
  description: string;
}

interface ChoreAssignment {
  id: string;
  chore_id: string;
  due_date: string;
  status: string;
  chore: {
    id: string;
    title: string;
    points: number;
    photo_required: boolean;
    steps?: ChoreStep[];
    icon?: string;
  };
}

interface ChildSession {
  childId: string;
  nickname: string;
  points: number;
  familyId: string;
}

export default function ChildToday() {
  const [assignments, setAssignments] = useState<ChoreAssignment[]>([]);
  const [childSession, setChildSession] = useState<ChildSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, _setShowConfetti] = useState(false);
  const [level, setLevel] = useState(1);
  const [characterMood, setCharacterMood] = useState<'happy' | 'normal' | 'sleepy'>('happy');
  const [selectedAssignment, setSelectedAssignment] = useState<ChoreAssignment | null>(null);
  const [showChoreDetail, setShowChoreDetail] = useState(false);
  const [goalPoints, setGoalPoints] = useState<number | null>(null);
  const [reward, setReward] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [_earnedPoints, setEarnedPoints] = useState(0);
  const [currentGoalNumber, setCurrentGoalNumber] = useState(1);
  const [characterSlotLevel, setCharacterSlotLevel] = useState(1);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
        loadAssignments(parsedSession.childId);
      // 초기 로드 시 최신 포인트 가져오기
      loadLatestPoints(parsedSession.childId);
      // 캐릭터 데이터 로드
      loadCharacterData(parsedSession.childId);
      
      // 자녀 로그인 시 푸시 알림 구독
      initializePushNotifications(parsedSession.childId, true);
      } catch (e) {
      navigate('/');
      return;
    }

    // Subscribe to new chore assignments for this child
    const assignmentsChannel = supabase
      .channel('child-assignments-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chore_assignments',
          filter: `child_id=eq.${parsedSession.childId}`,
        },
        (payload) => {
          console.log('New assignment received:', payload);
          // Reload assignments when new one is created
          loadAssignments(parsedSession.childId);
        }
      )
      .subscribe();

    // Subscribe to submission status updates (해당 자녀의 제출물만)
    const submissionsChannel = supabase
      .channel('child-submissions-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'submissions',
          filter: `child_id=eq.${parsedSession.childId}`,
        },
        async (payload) => {
          if (payload.new.status === 'approved' && payload.old.status !== 'approved') {
            // 포인트 정보 가져오기
            const { data: choreData } = await supabase
              .from('chores')
              .select('points')
              .eq('id', payload.new.chore_id)
              .single();
            
            const points = choreData?.points || 10;
            setEarnedPoints(points);
            setShowCelebration(true);
            
            // 최신 포인트 다시 로드
            loadLatestPoints(parsedSession.childId);
          }
        }
      )
      .subscribe();

    // Subscribe to points_ledger updates (포인트 실시간 갱신)
    // child_points_view는 뷰이므로 직접 구독할 수 없으므로 points_ledger를 구독
    const pointsLedgerChannel = supabase
      .channel('child-points-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'points_ledger',
          filter: `child_id=eq.${parsedSession.childId}`,
        },
        (payload) => {
          console.log('Points ledger updated:', payload);
          // 포인트 내역이 변경되면 최신 포인트 다시 로드
          loadLatestPoints(parsedSession.childId);
        }
      )
      .subscribe();

    // Subscribe to character_slots updates
    const characterSlotsChannel = supabase
      .channel('child-character-slots-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'character_slots',
          filter: `child_id=eq.${parsedSession.childId}`,
        },
        () => {
          console.log('Character slots updated');
          loadCharacterData(parsedSession.childId);
        }
      )
      .subscribe();

    // Subscribe to progress_tracker updates
    const progressTrackerChannel = supabase
      .channel('child-progress-tracker-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'character_progress_tracker',
          filter: `child_id=eq.${parsedSession.childId}`,
        },
        () => {
          console.log('Progress tracker updated');
          loadCharacterData(parsedSession.childId);
        }
      )
      .subscribe();

    // Subscribe to children table updates (포인트 실시간 갱신) - for settings modal
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
      supabase.removeChannel(assignmentsChannel);
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(pointsLedgerChannel);
      supabase.removeChannel(characterSlotsChannel);
      supabase.removeChannel(progressTrackerChannel);
      supabase.removeChannel(childrenChannel);
    };
  }, [navigate]);

  const loadAssignments = async (childId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log('Loading assignments for child:', childId, 'on date:', today);
      
      // First, check if we can query the table at all
      const { data: testData, error: testError } = await supabase
        .from('chore_assignments')
        .select('id')
        .eq('child_id', childId)
        .limit(1);
      
      console.log('Test query result:', { testData, testError });
      
      // Load all pending assignments (not just today's)
      const { data, error } = await supabase
        .from('chore_assignments')
        .select(`
          *,
          chore:chores(
            id,
            title,
            points,
            photo_required,
            active,
            steps,
            icon
          )
        `)
        .eq('child_id', childId)
        .eq('status', 'todo')
        .gte('due_date', today) // Show assignments due today or in the future
        .order('due_date', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading assignments:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
      } else {
        console.log('Loaded assignments:', data);
        console.log('Number of assignments:', data?.length || 0);
        setAssignments(data as ChoreAssignment[]);
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLatestPoints = async (childId: string) => {
    try {
      // Use child_points_view for real-time accurate points from points_ledger
      const { data: pointsData } = await supabase
        .from('child_points_view')
        .select('total_points')
        .eq('child_id', childId)
        .single();

      // Load goal_points, reward, and avatar_url from children table
      const { data: childData } = await supabase
        .from('children')
        .select('goal_points, reward, avatar_url')
        .eq('id', childId)
        .single();

      if (pointsData) {
        const session = localStorage.getItem('child_session');
        if (session) {
          try {
            const parsedSession: ChildSession = JSON.parse(session);
            const updatedSession = { ...parsedSession, points: pointsData.total_points };
            localStorage.setItem('child_session', JSON.stringify(updatedSession));
            setChildSession(updatedSession);
            calculateLevel(pointsData.total_points, childData?.goal_points || null);
          } catch (e) {
            console.error('Error updating session:', e);
          }
        }
      }

      if (childData && pointsData) {
        setGoalPoints(childData.goal_points);
        setReward(childData.reward);
        setAvatarUrl(childData.avatar_url);
        
        // Check if goal is achieved and reset if needed
        if (childData.goal_points && pointsData.total_points >= childData.goal_points) {
          await handleGoalAchievement(childId, childData.goal_points, childData.reward, pointsData.total_points);
        }
      }
    } catch (error) {
      console.error('Error loading latest points:', error);
    }
  };

  const handleGoalAchievement = async (
    childId: string,
    goalPoints: number,
    reward: string | null,
    pointsAtAchievement: number
  ) => {
    try {
      // Check if this goal was already recorded
      const { data: existingGoal } = await supabase
        .from('goal_history')
        .select('id')
        .eq('child_id', childId)
        .eq('points_at_achievement', pointsAtAchievement)
        .gte('achieved_at', new Date(Date.now() - 60000).toISOString()) // Within last minute
        .single();

      if (existingGoal) {
        // Already recorded, skip
        return;
      }

      // Record goal achievement
      const { error: historyError } = await supabase
        .from('goal_history')
        .insert({
          child_id: childId,
          goal_points: goalPoints,
          reward: reward,
          points_at_achievement: pointsAtAchievement,
        });

      if (historyError) {
        console.error('Error recording goal achievement:', historyError);
        return;
      }

      // Reset points by subtracting goal_points from points_ledger
      const { error: resetError } = await supabase
        .from('points_ledger')
        .insert({
          child_id: childId,
          delta: -goalPoints,
          reason: 'goal_achieved_reset',
        });

      if (resetError) {
        console.error('Error resetting points:', resetError);
      } else {
        // Reload points after reset
        setTimeout(() => {
          if (childSession) {
            loadLatestPoints(childSession.childId);
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error handling goal achievement:', error);
    }
  };

  const loadCharacterData = async (childId: string) => {
    try {
      // 현재 목표 번호 가져오기
      const { data: trackerData } = await supabase
        .from('character_progress_tracker')
        .select('current_goal_number')
        .eq('child_id', childId)
        .single();

      if (trackerData) {
        const goalNumber = trackerData.current_goal_number;
        setCurrentGoalNumber(goalNumber);

        // 해당 슬롯의 레벨 가져오기
        const { data: slotData } = await supabase
          .from('character_slots')
          .select('level')
          .eq('child_id', childId)
          .eq('slot_number', goalNumber)
          .single();

        if (slotData) {
          setCharacterSlotLevel(slotData.level || 1);
          setLevel(slotData.level || 1);
        } else {
          setCharacterSlotLevel(1);
          setLevel(1);
        }
      } else {
        setCurrentGoalNumber(1);
        setCharacterSlotLevel(1);
        setLevel(1);
      }
    } catch (error) {
      console.error('Error loading character data:', error);
      setCurrentGoalNumber(1);
      setCharacterSlotLevel(1);
      setLevel(1);
    }
  };

  // 캐릭터 이미지 경로 생성
  const getCharacterImage = (slotNumber: number, level: number) => {
    return `/icons/characters/${slotNumber}-${level}.png`;
  };

  const calculateLevel = (points: number, goalPoints: number | null) => {
    // 레벨은 캐릭터 슬롯 레벨로 덮어쓰기 때문에 여기서는 계산하지 않음
    // 캐릭터 기분을 목표치 대비 퍼센트로 결정
    if (goalPoints && goalPoints > 0) {
      const progressPercent = (points / goalPoints) * 100;
      if (progressPercent >= 100) {
        setCharacterMood('happy');
      } else if (progressPercent >= 66) {
        setCharacterMood('happy');
      } else if (progressPercent >= 33) {
        setCharacterMood('normal');
      } else {
        setCharacterMood('sleepy');
      }
    } else {
      // 목표가 없으면 기본값
      setCharacterMood('normal');
    }
  };

  const handleUpload = (choreId: string) => {
    navigate(`/child/upload?chore_id=${choreId}`);
  };

  const handleChoreClick = (assignment: ChoreAssignment) => {
    setSelectedAssignment(assignment);
    setShowChoreDetail(true);
  };

  const calculateDaysUntilDue = (dueDate: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

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

  if (loading || !childSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E6F7F2] pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {/* Celebration Modal */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 상단 트로피 배경 이미지 - 상단 65%만 표시 */}
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(/celebration/celebration-trophy.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'top center',
              backgroundRepeat: 'no-repeat',
              clipPath: 'polygon(0 0, 100% 0, 100% 65%, 0 65%)',
            }}
          />
          
          {/* 하단 그라데이션 이미지 - 하단 50%부터 표시, 자연스러운 블렌딩 */}
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(/celebration/celebration-gradient.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'bottom center',
              backgroundRepeat: 'no-repeat',
              clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)',
              opacity: 0.9,
              // 중간 부분 그라데이션 블렌딩
              maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)',
            }}
          />

          {/* 콘텐츠 */}
          <div className="relative z-10 w-full max-w-md">
            {/* 메시지 */}
            <h2 className="text-4xl sm:text-5xl font-bold text-white text-center mb-8 drop-shadow-lg">
              YOU&apos;RE GETTING CLOSER!
            </h2>

            {/* 진행 상황 박스 */}
            <div className="bg-[#FFFBF5] border-2 border-orange-300 rounded-3xl p-6 mb-6 shadow-2xl">
              {/* Goal Points 헤더 */}
              <div className="flex items-center gap-2 mb-4">
                <Icon name="star" size={20} className="text-orange-500" />
                <span className="text-lg font-bold text-gray-800">Goal Points</span>
              </div>

              {/* 진행 바 */}
              <div className="w-full bg-white rounded-full h-6 mb-4 overflow-hidden border-2 border-orange-200">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    background: 'linear-gradient(to right, #FF8C00, #FFA500)',
                    width: `${goalPoints ? Math.min(100, ((childSession?.points || 0) / goalPoints) * 100) : 0}%`
                  }}
                />
              </div>

              {/* 남은 포인트 텍스트 */}
              {goalPoints && (
                <p className="text-lg font-bold text-orange-600 text-center">
                  {Math.max(0, goalPoints - (childSession?.points || 0))} Points left to {reward || 'your goal'}!
                </p>
              )}
            </div>

            {/* Go back to home 버튼 */}
            <button
              onClick={() => {
                setShowCelebration(false);
                setEarnedPoints(0);
              }}
              className="w-full bg-[#FFFBF5] border-2 border-orange-300 text-gray-800 rounded-2xl py-4 font-semibold text-lg shadow-xl hover:bg-orange-50 transition-colors"
            >
              Go back to home
            </button>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-[#E6F7F2] pb-20">
        {/* Confetti effect */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            <div className="text-6xl animate-bounce">🎉</div>
          </div>
        )}
      
      <div 
        className="max-w-md mx-auto"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 40px)',
          paddingBottom: '16px',
          paddingLeft: '16px',
          paddingRight: '16px',
        }}
      >
        {/* 헤더 + 카드들 간격 일정하게 */}
        <div className="space-y-4">
          {/* 헤더: 카드랑 같은 폭/인셋, 배경 없음 */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <div className="w-12 h-12 rounded-full border-2 border-[#5CE1C6] overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex-shrink-0">
                    <img
                      src={avatarUrl}
                      alt={childSession.nickname}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full border-2 border-[#5CE1C6] overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-white">
                      {childSession.nickname[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <h1 className="text-2xl font-bold text-gray-800">
                  Hi, {childSession.nickname} 👋
                </h1>
              </div>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
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
            <p className="text-gray-600 text-sm mb-7">
              Complete today&apos;s chores!
            </p>
          </div>

          {/* Character Section */}
          <div className="bg-white rounded-3xl shadow-sm p-6 border border-white/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-1">My Character</h2>
              <div className="flex items-center gap-2">
                <Icon name="star" size={16} active={true} />
                <span className="text-sm font-semibold text-gray-700">Level {level}</span>
              </div>
            </div>
            {/* Character Image */}
            <div className="relative">
              <div className={`transform transition-all duration-500 ${
                characterMood === 'happy' ? 'scale-110 animate-bounce' : 
                characterMood === 'normal' ? 'scale-100' : 'scale-90'
              }`}>
                <img
                  src={getCharacterImage(currentGoalNumber, characterSlotLevel)}
                  alt={`Character Level ${characterSlotLevel}`}
                  className="w-20 h-20 object-contain drop-shadow-lg"
                  onError={(e) => {
                    // 이미지 로드 실패 시 기본 이미지 사용
                    (e.target as HTMLImageElement).src = `/icons/characters/${currentGoalNumber}-1.png`;
                  }}
                />
              </div>
            </div>
          </div>
          
          {/* Goal Points & Reward */}
          {goalPoints && (
            <div className="mt-4 p-4 bg-white rounded-2xl shadow-sm border border-white/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Goal Points</span>
                <span className="text-lg font-bold text-gray-800">
                  {childSession?.points || 0} / {goalPoints} pts
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
                <div
                  className="bg-gradient-to-r from-[#5CE1C6] to-[#4ECDC4] rounded-full h-3 transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, ((childSession?.points || 0) / goalPoints) * 100)}%` 
                  }}
                />
              </div>
              {reward && (
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Reward when you reach the goal:</p>
                  <p className="text-lg font-bold text-gray-800">🎁 {reward}</p>
                </div>
              )}
              {childSession && childSession.points >= goalPoints && (
                <div className="mt-2 text-center">
                  <p className="text-sm font-bold text-[#5CE1C6] animate-pulse">🎉 Goal Achieved! 🎉</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Today's Chores */}
        {assignments.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm p-8 text-center border border-white/50">
              <p className="text-gray-600 text-lg">No chores today! 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {assignments.map((assignment) => {
              const daysUntilDue = calculateDaysUntilDue(assignment.due_date);
              const daysText = daysUntilDue === 0 ? 'D-Day' : daysUntilDue > 0 ? `D-${daysUntilDue}` : `D+${Math.abs(daysUntilDue)}`;
              
              return (
                <div
                  key={assignment.id}
                  onClick={() => handleChoreClick(assignment)}
                  className="bg-white rounded-3xl shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer border border-white/50"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-[#E6F7F2] rounded-xl flex items-center justify-center mx-auto mb-2">
                      {assignment.chore.icon && !assignment.chore.icon.match(/[\u{1F300}-\u{1F9FF}]/u) ? (
                        <Icon name={assignment.chore.icon} size={32} />
                      ) : assignment.chore.icon ? (
                        <span className="text-3xl">{assignment.chore.icon}</span>
                      ) : (
                        <Icon name="chore" size={32} />
                      )}
                    </div>
                    <h3 className="font-bold text-gray-800 mb-2 text-sm">
                      {assignment.chore.title}
                    </h3>
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <Icon name="star" size={16} className="text-[#FFB84D]" />
                      <span className="text-sm font-semibold text-gray-700">
                        {assignment.chore.points} pts
                      </span>
                    </div>
                    <div className="text-xs text-[#5CE1C6] font-semibold">
                      {daysText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Chore Detail Modal */}
        {showChoreDetail && selectedAssignment && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-6 max-h-[80vh] overflow-y-auto border border-white/50">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    {selectedAssignment.chore.title}
                  </h3>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="star" size={16} />
                    <span className="text-gray-600">{selectedAssignment.chore.points} points</span>
                    <span className="text-[#5CE1C6] font-semibold ml-2">
                      {(() => {
                        const days = calculateDaysUntilDue(selectedAssignment.due_date);
                        return days === 0 ? 'D-Day' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
                      })()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowChoreDetail(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              {selectedAssignment.chore.steps && selectedAssignment.chore.steps.length > 0 ? (
                <div className="space-y-3 mb-6">
                  <h4 className="font-semibold text-gray-800 mb-2">Steps:</h4>
                  {selectedAssignment.chore.steps.map((step: any, index: number) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-[#E6F7F2] rounded-xl">
                      <span className="font-bold text-[#5CE1C6] w-6">{step.order}.</span>
                      <p className="text-gray-700 flex-1">{step.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4 mb-6">No steps defined</p>
              )}

              <button
                onClick={() => {
                  setShowChoreDetail(false);
                  handleUpload(selectedAssignment.chore.id);
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-orange-400 to-pink-400 text-white rounded-lg hover:from-orange-500 hover:to-pink-500 transition-colors font-bold"
              >
                📸 Upload Photo
              </button>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <div 
              className="bg-white rounded-3xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto border border-white/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Profile</h1>
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
                {/* Avatar Section */}
                <div className="text-center">
                  <div className="relative w-24 h-24 mx-auto mb-4">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#5CE1C6] bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={childSession?.nickname || ''}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl font-bold text-white">
                          {childSession?.nickname[0].toUpperCase() || ''}
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
                  <h2 className="text-xl font-bold text-gray-800">{childSession?.nickname}</h2>
                  {uploading && (
                    <p className="text-sm text-gray-500 mt-2">Uploading...</p>
                  )}
                </div>

                {/* Profile Photo Setting Button */}
                <label className="block">
                  <div className="bg-[#E6F7F2] rounded-xl p-4 cursor-pointer hover:bg-[#D4F4E8] transition-colors">
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="w-5 h-5 text-gray-700"
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
                      <span className="font-semibold text-gray-800">Choose Profile Photo</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="w-full px-6 py-3 bg-gray-400 text-white rounded-xl hover:bg-gray-500 transition-colors font-bold shadow-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <ChildTabNav />
    </div>
    </>
  );
}

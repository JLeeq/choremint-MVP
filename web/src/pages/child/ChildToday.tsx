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
  const [showConfetti, setShowConfetti] = useState(false);
  const [characterMood, setCharacterMood] = useState<'happy' | 'normal' | 'sleepy'>('happy');
  const [selectedAssignment, setSelectedAssignment] = useState<ChoreAssignment | null>(null);
  const [showChoreDetail, setShowChoreDetail] = useState(false);
  const [goalPoints, setGoalPoints] = useState<number | null>(null);
  const [reward, setReward] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
        (payload) => {
          if (payload.new.status === 'approved') {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
            // 포인트는 children 테이블 업데이트로 자동 갱신됨
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

    return () => {
      supabase.removeChannel(assignmentsChannel);
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(pointsLedgerChannel);
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

  const calculateLevel = (points: number, goalPoints: number | null) => {
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

  if (loading || !childSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
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
            <div className="flex items-center gap-3 mb-3">
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
            <p className="text-gray-600 text-sm mb-7">
              Complete today&apos;s chores!
            </p>
          </div>

          {/* Character Section */}
          <div className="bg-[#ADFF2F] rounded-3xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-1">My Character</h2>
            </div>
            {/* Character SVG (3D-like appearance) */}
            <div className="relative">
              <div className={`transform transition-all duration-500 ${
                characterMood === 'happy' ? 'scale-110 animate-bounce' : 
                characterMood === 'normal' ? 'scale-100' : 'scale-90'
              }`}>
                <svg
                  width="80"
                  height="80"
                  viewBox="0 0 200 200"
                  className="drop-shadow-lg"
                >
                  {/* Body (3D sphere effect) */}
                  <defs>
                    <radialGradient id="bodyGradient" cx="50%" cy="30%">
                      <stop offset="0%" stopColor="#FFD700" />
                      <stop offset="50%" stopColor="#FFA500" />
                      <stop offset="100%" stopColor="#FF8C00" />
                    </radialGradient>
                    <radialGradient id="eyeGradient" cx="50%" cy="30%">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="100%" stopColor="#E0E0E0" />
                    </radialGradient>
                  </defs>
                  
                  {/* Body circle with 3D effect */}
                  <circle
                    cx="100"
                    cy="120"
                    r="60"
                    fill="url(#bodyGradient)"
                    className="drop-shadow-xl"
                  />
                  
                  {/* Highlight for 3D effect */}
                  <ellipse
                    cx="85"
                    cy="100"
                    rx="25"
                    ry="30"
                    fill="rgba(255, 255, 255, 0.4)"
                  />
                  
                  {/* Eyes */}
                  <circle
                    cx="85"
                    cy="110"
                    r="8"
                    fill="url(#eyeGradient)"
                  />
                  <circle
                    cx="115"
                    cy="110"
                    r="8"
                    fill="url(#eyeGradient)"
                  />
                  
                  {/* Pupils */}
                  <circle
                    cx={characterMood === 'happy' ? '88' : '85'}
                    cy="110"
                    r="4"
                    fill="#000"
                  />
                  <circle
                    cx={characterMood === 'happy' ? '118' : '115'}
                    cy="110"
                    r="4"
                    fill="#000"
                  />
                  
                  {/* Mouth */}
                  {characterMood === 'happy' ? (
                    <path
                      d="M 85 125 Q 100 140 115 125"
                      stroke="#000"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                  ) : characterMood === 'normal' ? (
                    <line
                      x1="90"
                      y1="125"
                      x2="110"
                      y2="125"
                      stroke="#000"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  ) : (
                    <path
                      d="M 85 130 Q 100 120 115 130"
                      stroke="#000"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </div>
            </div>
          </div>
          
          {/* Goal Points & Reward */}
          {goalPoints && (
            <div className="mt-4 p-4 bg-gradient-to-br from-[#FF7F7F] to-[#FFB6C1] rounded-2xl text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Goal Points</span>
                <span className="text-lg font-bold">
                  {childSession?.points || 0} / {goalPoints} pts
                </span>
              </div>
              <div className="w-full bg-white/30 rounded-full h-3 mb-3">
                <div
                  className="bg-white rounded-full h-3 transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, ((childSession?.points || 0) / goalPoints) * 100)}%` 
                  }}
                />
              </div>
              {reward && (
                <div className="text-center">
                  <p className="text-xs opacity-90 mb-1">Reward when you reach the goal:</p>
                  <p className="text-lg font-bold">🎁 {reward}</p>
                </div>
              )}
              {childSession && childSession.points >= goalPoints && (
                <div className="mt-2 text-center">
                  <p className="text-sm font-bold animate-pulse">🎉 Goal Achieved! 🎉</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Today's Chores */}
        {assignments.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
              <p className="text-gray-500 text-lg">No chores today! 🎉</p>
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
                  className="bg-white rounded-2xl shadow-lg p-4 hover:shadow-xl transition-shadow cursor-pointer"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-2">
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
                      <Icon name="star" size={16} className="text-yellow-500" />
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
          <div 
            className="fixed inset-0 backdrop-blur-md bg-black/20 flex items-center justify-center z-50 p-4 pointer-events-none"
            onClick={() => setShowChoreDetail(false)}
          >
            <div 
              className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto pointer-events-auto my-2 mx-3" 
              style={{ WebkitOverflowScrolling: 'touch' }}
              onClick={(e) => e.stopPropagation()}
            >
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
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
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
                className="w-full px-4 py-3 bg-[#5CE1C6] text-white rounded-lg hover:bg-[#4BC9B0] transition-colors font-bold flex items-center justify-center gap-2"
              >
                <Icon name="camera" size={20} className="[&_svg_path]:fill-white [&_svg_circle]:fill-white [&_svg_rect]:fill-white [&_svg_polygon]:fill-white [&_svg_polyline]:fill-white" />
                Upload Photo
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      <ChildTabNav />
    </div>
  );
}

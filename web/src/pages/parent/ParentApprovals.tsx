import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';
import { sendPushNotification } from '../../lib/pushNotifications';

interface Submission {
  id: string;
  child_id: string;
  photo_url: string;
  status: string;
  created_at: string;
  child: {
    nickname: string;
    avatar_url?: string;
  };
  chore: {
    title: string;
    points: number;
  } | null;
}

interface ChoreAssignment {
  id: string;
  child_id: string;
  chore_id: string;
  due_date: string;
  status: string;
  created_at: string;
  child: {
    nickname: string;
    avatar_url?: string;
  };
  chore: {
    title: string;
    points: number;
    icon?: string;
  } | null;
  submission?: {
    id: string;
    photo_url: string;
    created_at: string;
  } | null;
}

type TabType = 'to-approve' | 'incomplete' | 'completed';

export default function ParentApprovals() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [incompleteAssignments, setIncompleteAssignments] = useState<ChoreAssignment[]>([]);
  const [completedAssignments, setCompletedAssignments] = useState<ChoreAssignment[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('to-approve');
  const navigate = useNavigate();

  useEffect(() => {
    loadSubmissions();
    loadIncompleteAssignments();
    loadCompletedAssignments();
  }, []);

  useEffect(() => {
    // Subscribe to realtime updates
    const submissionsChannel = supabase
      .channel('parent-approvals-submissions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'submissions',
        },
        () => {
          loadSubmissions();
        }
      )
      .subscribe();

    const assignmentsChannel = supabase
      .channel('parent-approvals-assignments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chore_assignments',
        },
        () => {
          loadIncompleteAssignments();
          loadCompletedAssignments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(assignmentsChannel);
    };
  }, []);

  const loadSubmissions = async () => {
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
        const { data } = await supabase
          .from('submissions')
          .select(`
            *,
            child:children(nickname, avatar_url),
            chore:chores(title, points)
          `)
          .eq('family_id', familyData.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (data) {
          setSubmissions(data as Submission[]);
        }
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
    }
  };

  const loadIncompleteAssignments = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return;
    }

    try {
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (familyData) {
        // Get all active children IDs
        const { data: childrenData } = await supabase
          .from('children')
          .select('id')
          .eq('family_id', familyData.id)
          .eq('active', true);

        if (!childrenData || childrenData.length === 0) {
          setIncompleteAssignments([]);
          return;
        }

        const childIds = childrenData.map(c => c.id);
        const today = new Date().toISOString().split('T')[0];

        // Load incomplete assignments: status='todo' AND due_date < today
        const { data } = await supabase
          .from('chore_assignments')
          .select(`
            *,
            child:children(nickname, avatar_url),
            chore:chores(title, points, icon)
          `)
          .in('child_id', childIds)
          .eq('status', 'todo')
          .lt('due_date', today)
          .order('due_date', { ascending: true });

        if (data) {
          setIncompleteAssignments(data as ChoreAssignment[]);
        }
      }
    } catch (error) {
      console.error('Error loading incomplete assignments:', error);
    }
  };

  const loadCompletedAssignments = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return;
    }

    try {
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (familyData) {
        // Get all active children IDs
        const { data: childrenData } = await supabase
          .from('children')
          .select('id')
          .eq('family_id', familyData.id)
          .eq('active', true);

        if (!childrenData || childrenData.length === 0) {
          setCompletedAssignments([]);
          return;
        }

        const childIds = childrenData.map(c => c.id);

        // Load completed assignments: status='done'
        const { data } = await supabase
          .from('chore_assignments')
          .select(`
            *,
            child:children(nickname, avatar_url),
            chore:chores(title, points, icon)
          `)
          .in('child_id', childIds)
          .eq('status', 'done')
          .order('updated_at', { ascending: false })
          .limit(50);

        if (data) {
          // Load submissions for completed assignments
          const { data: submissionsData } = await supabase
            .from('submissions')
            .select('id, photo_url, created_at, chore_id, child_id')
            .in('child_id', childIds)
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

          // Match submissions to assignments
          const assignmentsWithSubmissions = data.map((assignment: ChoreAssignment) => {
            const submission = submissionsData?.find(
              s => s.child_id === assignment.child_id && s.chore_id === assignment.chore_id
            );
            return {
              ...assignment,
              submission: submission ? {
                id: submission.id,
                photo_url: submission.photo_url,
                created_at: submission.created_at
              } : null
            };
          });

          setCompletedAssignments(assignmentsWithSubmissions as ChoreAssignment[]);
        }
      }
    } catch (error) {
      console.error('Error loading completed assignments:', error);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setLoading(true);
    try {
      // 제출물 정보 가져오기 (승인 전)
      const submission = submissions.find(s => s.id === submissionId);
      
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'approved' })
        .eq('id', submissionId);

      if (error) throw error;

      // 승인 후 푸시 알림 전송
      if (submission) {
        const points = submission.chore?.points || 10;
        await sendPushNotification(
          submission.child_id,
          'Congratulations! 🎉',
          `${submission.chore?.title || 'Chore'} approved! You received ${points} points!`,
          '/child/today'
        );
      }

      setSelectedSubmission(null);
      loadSubmissions();
    } catch (error: any) {
      alert(error.message || 'Error occurred while approving.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (submissionId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'rejected' })
        .eq('id', submissionId);

      if (error) throw error;

      setSelectedSubmission(null);
      loadSubmissions();
    } catch (error: any) {
      alert(error.message || 'Error occurred while rejecting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-4xl mx-auto p-3 sm:p-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 pt-6 sm:pt-8">Manage Chores</h1>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 sm:mb-6">
          <button 
            onClick={() => setActiveTab('to-approve')}
            className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-normal text-[10px] sm:text-xs transition-colors border border-[#1E3A8A] ${
              activeTab === 'to-approve'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-[#B2F5EA] text-gray-700 hover:bg-[#A8E6CF]'
            }`}
          >
            To Approve
          </button>
          <button 
            onClick={() => setActiveTab('incomplete')}
            className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-normal text-[10px] sm:text-xs transition-colors border border-[#1E3A8A] ${
              activeTab === 'incomplete'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-[#B2F5EA] text-gray-700 hover:bg-[#A8E6CF]'
            }`}
          >
            Incomplete
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-normal text-[10px] sm:text-xs transition-colors border border-[#1E3A8A] ${
              activeTab === 'completed'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-[#B2F5EA] text-gray-700 hover:bg-[#A8E6CF]'
            }`}
          >
            Completed
          </button>
        </div>

        {/* To Approve Tab */}
        {activeTab === 'to-approve' && (
          submissions.length === 0 ? (
            <div className="bg-[#B2F5EA] rounded-2xl p-8 text-center">
              <p className="text-gray-700">No pending submissions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  onClick={() => setSelectedSubmission(submission)}
                  className="bg-[#B2F5EA] rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    {/* 좌측: 자녀 프로필 + 정보 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* 자녀 아바타 */}
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-gray-200 overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                        {submission.child.avatar_url ? (
                          <img
                            src={submission.child.avatar_url}
                            alt={submission.child.nickname}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xl font-bold text-white">
                            {submission.child.nickname[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      
                      {/* 자녀 이름 + chore 이름 + 날짜 */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm sm:text-base mb-1">
                          {submission.child.nickname}
                        </p>
                        {submission.chore && (
                          <p className="text-sm text-gray-800 font-medium mb-1">
                            {submission.chore.title}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          {new Date(submission.created_at).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          }).replace(/\./g, '.').replace(/,/g, '')}
                        </p>
                      </div>
                    </div>

                    {/* 우측: 이미지 썸네일 + 포인트 뱃지 */}
                    <div className="relative flex-shrink-0">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-100">
                        <img
                          src={submission.photo_url}
                          alt="Submission"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* 포인트 뱃지 */}
                      {submission.chore && (
                        <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-lg">
                          {submission.chore.points}pt
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Incomplete Tab */}
        {activeTab === 'incomplete' && (
          incompleteAssignments.length === 0 ? (
            <div className="bg-[#B2F5EA] rounded-2xl p-8 text-center">
              <p className="text-gray-700">No incomplete chores.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incompleteAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="bg-[#B2F5EA] rounded-2xl p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-gray-200 overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                        {assignment.child.avatar_url ? (
                          <img
                            src={assignment.child.avatar_url}
                            alt={assignment.child.nickname}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xl font-bold text-white">
                            {assignment.child.nickname[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm sm:text-base mb-1">
                          {assignment.child.nickname}
                        </p>
                        {assignment.chore && (
                          <p className="text-sm text-[#1E3A8A] font-medium mb-1">
                            {assignment.chore.title}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          Due: {new Date(assignment.due_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    {assignment.chore && (
                      <div className="bg-[#1E3A8A] text-white text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0">
                        {assignment.chore.points}pt
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Completed Tab */}
        {activeTab === 'completed' && (
          completedAssignments.length === 0 ? (
            <div className="bg-[#B2F5EA] rounded-2xl p-8 text-center">
              <p className="text-gray-700">No completed chores.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="bg-[#B2F5EA] rounded-2xl p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-gray-200 overflow-hidden bg-gradient-to-br from-orange-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                        {assignment.child.avatar_url ? (
                          <img
                            src={assignment.child.avatar_url}
                            alt={assignment.child.nickname}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xl font-bold text-white">
                            {assignment.child.nickname[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm sm:text-base mb-1">
                          {assignment.child.nickname}
                        </p>
                        {assignment.submission && (
                          <p className="text-xs text-gray-500 mb-1">
                            {new Date(assignment.submission.created_at).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </p>
                        )}
                        {assignment.chore && (
                          <div className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#1E3A8A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-sm text-[#1E3A8A] font-medium">
                              {assignment.chore.title}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="relative flex-shrink-0">
                      {assignment.submission ? (
                        <>
                          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-100">
                            <img
                              src={assignment.submission.photo_url}
                              alt="Completed"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {assignment.chore && (
                            <div className="absolute -bottom-1 -right-1 bg-[#1E3A8A] text-white text-xs font-bold px-2 py-1 rounded-lg">
                              {assignment.chore.points}pt
                            </div>
                          )}
                        </>
                      ) : (
                        assignment.chore && (
                          <div className="bg-[#1E3A8A] text-white text-xs font-bold px-3 py-1.5 rounded-full">
                            {assignment.chore.points}pt
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Modal for selected submission */}
        {selectedSubmission && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedSubmission(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 - 뒤로가기 + 자녀 이름 */}
              <div className="flex items-center gap-3 p-4 border-b border-gray-200">
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-xl font-bold text-gray-800 flex-1">
                  {selectedSubmission.child.nickname}
                </h3>
              </div>

              {/* 큰 이미지 */}
              <div className="w-full">
                <img
                  src={selectedSubmission.photo_url}
                  alt="Submission"
                  className="w-full h-auto rounded-b-2xl"
                />
              </div>

              {/* Chore 정보 */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    {selectedSubmission.chore && (
                      <>
                        <h4 className="text-xl font-bold text-gray-800 mb-1">
                          {selectedSubmission.chore.title}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {new Date(selectedSubmission.created_at).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          }).replace(/\./g, '.').replace(/,/g, '')}
                        </p>
                      </>
                    )}
                  </div>
                  {selectedSubmission.chore && (
                    <div className="bg-gray-800 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
                      {selectedSubmission.chore.points}pt
                    </div>
                  )}
                </div>

                {/* 메시지 박스 (있는 경우) */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm">
                    I completed this chore!
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReject(selectedSubmission.id)}
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 font-bold flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(selectedSubmission.id)}
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-[#1E3A8A] text-white rounded-lg hover:bg-[#2563EB] transition-colors disabled:opacity-50 font-bold flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Approve
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <ParentTabNav />
    </div>
  );
}


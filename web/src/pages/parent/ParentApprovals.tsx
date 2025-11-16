import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';
import Icon from '../../components/Icon';
import { sendPushNotification } from '../../lib/pushNotifications';

interface Submission {
  id: string;
  child_id: string;
  photo_url: string;
  status: string;
  created_at: string;
  child: {
    nickname: string;
  };
  chore: {
    title: string;
    points: number;
  } | null;
}

export default function ParentApprovals() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    // Subscribe to realtime updates
    const channel = supabase
      .channel('parent-approvals')
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

    return () => {
      supabase.removeChannel(channel);
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
            child:children(nickname),
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
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">Pending Approvals</h1>
        </div>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="text-gray-500">No pending submissions.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                onClick={() => setSelectedSubmission(submission)}
                className="bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
              >
                <img
                  src={submission.photo_url}
                  alt="Submission"
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <p className="font-medium text-gray-800 mb-1">
                    {submission.child.nickname}
                  </p>
                  {submission.chore && (
                    <p className="text-sm text-gray-600 mb-2">{submission.chore.title}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {new Date(submission.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
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
              <img
                src={selectedSubmission.photo_url}
                alt="Submission"
                className="w-full h-auto"
              />
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  {selectedSubmission.child.nickname}
                </h3>
                {selectedSubmission.chore && (
                  <p className="text-gray-600 mb-4 flex items-center gap-1">
                    {selectedSubmission.chore.title} - <Icon name="star" size={16} /> {selectedSubmission.chore.points} pts
                  </p>
                )}
                <div className="flex gap-4">
                  <button
                    onClick={() => handleApprove(selectedSubmission.id)}
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 font-bold"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(selectedSubmission.id)}
                    disabled={loading}
                    className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 font-bold"
                  >
                    Reject
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


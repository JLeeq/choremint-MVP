import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ChildTabNav from '../../components/ChildTabNav';
import Icon from '../../components/Icon';

interface ChildSession {
  childId: string;
  nickname: string;
  points: number;
  familyId: string;
}

interface ChoreStep {
  order: number;
  description: string;
}

interface Chore {
  id: string;
  title: string;
  points: number;
  steps?: ChoreStep[];
}

export default function ChildUpload() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [childSession, setChildSession] = useState<ChildSession | null>(null);
  const [chore, setChore] = useState<Chore | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = localStorage.getItem('child_session');
    if (session) {
      try {
        const parsedSession: ChildSession = JSON.parse(session);
        setChildSession(parsedSession);
        
        // Load chore if chore_id is provided
        const choreId = searchParams.get('chore_id');
        if (choreId) {
          loadChore(choreId);
        }
      } catch (e) {
        navigate('/');
      }
    } else {
      navigate('/child-login');
    }
  }, [searchParams, navigate]);

  const loadChore = async (choreId: string) => {
    try {
      const { data } = await supabase
        .from('chores')
        .select('*')
        .eq('id', choreId)
        .single();

      if (data) {
        setChore(data);
        // steps가 JSON 문자열인 경우 파싱
        if (data.steps && typeof data.steps === 'string') {
          try {
            data.steps = JSON.parse(data.steps);
          } catch (e) {
            console.error('Error parsing steps:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading chore:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStepToggle = (order: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(order)) {
      newCompleted.delete(order);
    } else {
      newCompleted.add(order);
    }
    setCompletedSteps(newCompleted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!childSession || !selectedFile) {
      setError('사진을 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      // Upload photo to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${childSession.childId}-${Date.now()}.${fileExt}`;
      const filePath = `submissions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      // Create submission
      const { error: submissionError } = await supabase
        .from('submissions')
        .insert({
          child_id: childSession.childId,
          family_id: childSession.familyId,
          chore_id: chore?.id || null,
          photo_url: urlData.publicUrl,
          status: 'pending',
        });

      if (submissionError) throw submissionError;

      // Update assignment status if chore_id exists
      if (chore?.id) {
        const today = new Date().toISOString().split('T')[0];
        await supabase
          .from('chore_assignments')
          .update({ status: 'done' })
          .eq('chore_id', chore.id)
          .eq('child_id', childSession.childId)
          .eq('due_date', today);
      }

      alert('Photo uploaded successfully!');
      setSelectedFile(null);
      setPreview('');
      navigate('/child/today');
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
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
      <div className="max-w-md w-full mx-auto p-4">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-gray-800">
              {chore ? chore.title : 'Photo Upload'}
            </h1>
            {chore && (
              <div className="bg-green-100 rounded-full px-4 py-2 flex items-center gap-1">
                <Icon name="star" size={16} />
                <span className="text-green-700 font-semibold text-sm">
                  {chore.points} pts
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 집안일 단계 표시 */}
        {chore && chore.steps && chore.steps.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4">How to do it:</h2>
            <div className="space-y-3">
              {chore.steps.map((step) => {
                const isCompleted = completedSteps.has(step.order);
                return (
                  <label
                    key={step.order}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isCompleted
                        ? 'bg-green-50 border-2 border-green-200'
                        : 'bg-gray-50 border-2 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={() => handleStepToggle(step.order)}
                      className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                    />
                    <span className={`flex-1 ${isCompleted ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                      {step.description}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo Upload Card */}
          <div className="bg-white rounded-2xl p-5 shadow-md border-2 border-[#5CE1C6]/30">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Select Photo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full px-4 py-3 bg-white border-2 border-[#5CE1C6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5CE1C6] focus:border-[#4BC9B0] transition-all file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#5CE1C6]/10 file:text-[#5CE1C6] hover:file:bg-[#5CE1C6]/20"
              required
            />
          </div>

          {/* Preview Card */}
          {preview && (
            <div className="bg-gray-50 rounded-2xl p-4 shadow-md border-2 border-gray-100">
              <p className="text-sm font-semibold text-gray-700 mb-2">Preview</p>
              <img
                src={preview}
                alt="Preview"
                className="w-full h-64 object-cover rounded-xl"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !selectedFile}
            className="w-full px-6 py-4 bg-gradient-to-r from-orange-400 to-pink-400 text-white rounded-2xl hover:from-orange-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin"></span> Uploading...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Upload Photo
              </span>
            )}
          </button>
        </form>
      </div>
      <ChildTabNav />
    </div>
  );
}


import { useState, useEffect, useRef } from 'react';
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
  
  // 카메라 관련 state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // 카메라 열기
  const handleOpenCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // 후면 카메라 우선
        audio: false
      });
      setStream(mediaStream);
      setIsCameraOpen(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      setError('카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.');
    }
  };

  // 카메라 닫기
  const handleCloseCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  // 사진 촬영
  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // canvas 크기를 video 크기에 맞춤
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // video에서 이미지 캡처
    context.drawImage(video, 0, 0);

    // canvas를 blob으로 변환
    canvas.toBlob((blob) => {
      if (!blob) return;

      // blob을 File 객체로 변환
      const file = new File([blob], `photo-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      setSelectedFile(file);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // 카메라 닫기
      handleCloseCamera();
    }, 'image/jpeg', 0.9);
  };

  // 컴포넌트 언마운트 시 스트림 정리
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

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
      <div className="min-h-screen flex items-center justify-center bg-[#E6F7F2] pb-20">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E6F7F2] pb-20">
      <div className="max-w-md w-full mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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

        {/* 집안일 단계 표시 */}
        {chore && chore.steps && chore.steps.length > 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-6 mb-4 border border-white/50">
            <h2 className="text-lg font-bold text-gray-800 mb-4">How to do it:</h2>
            <div className="space-y-3">
              {chore.steps.map((step) => {
                const isCompleted = completedSteps.has(step.order);
                return (
                  <label
                    key={step.order}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      isCompleted
                        ? 'bg-[#D4F4E8] border-2 border-[#5CE1C6]'
                        : 'bg-[#E6F7F2] border-2 border-gray-200 hover:bg-[#D4F4E8]'
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
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-white/50">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Select Photo
            </label>
            
            {/* 카메라 버튼과 파일 선택 버튼 */}
            <div className="flex gap-3 mb-3">
              <button
                type="button"
                onClick={handleOpenCamera}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#5CE1C6] to-[#4ECDC4] text-white rounded-xl hover:from-[#4BC9B0] hover:to-[#3DB8A8] transition-colors font-semibold flex items-center justify-center gap-2 shadow-sm"
              >
                <Icon name="camera" size={20} color="#000000" />
                Take a Photo
              </button>
              <label className="flex-1 px-4 py-3 bg-white text-gray-700 rounded-xl hover:bg-[#E6F7F2] transition-colors font-semibold flex items-center justify-center gap-2 cursor-pointer border border-gray-200 shadow-sm">
                <Icon name="plus" size={24} color="#000000" />
                Choose from Gallery
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* 기존 파일 입력 (숨김 처리) */}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full px-4 py-3 bg-white border-2 border-[#5CE1C6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5CE1C6] focus:border-[#4BC9B0] transition-all file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#5CE1C6]/10 file:text-[#5CE1C6] hover:file:bg-[#5CE1C6]/20"
              style={{ display: 'none' }}
            />
          </div>

          {/* 카메라 모달 */}
          {isCameraOpen && (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
              <div className="flex-1 relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              
              <div className="p-6 bg-black/50">
                <div className="flex gap-4 justify-center">
                  <button
                    type="button"
                    onClick={handleCloseCamera}
                    className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors font-semibold"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    className="px-6 py-3 bg-[#5CE1C6] text-white rounded-xl hover:bg-[#4BC9B0] transition-colors font-semibold"
                  >
                    촬영
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview Card */}
          {preview && (
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-white/50">
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
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !selectedFile}
            className="w-full px-6 py-4 bg-[#3B82F6] text-white rounded-2xl hover:bg-[#2563EB] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
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


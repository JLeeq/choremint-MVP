import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';

export default function ChildUpload() {
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load PIN from URL query parameter
  useEffect(() => {
    const pinFromUrl = searchParams.get('pin');
    if (pinFromUrl) {
      setPin(pinFromUrl);
      // Optionally verify PIN and load nickname
      verifyPin(pinFromUrl);
    }
  }, [searchParams]);

  const verifyPin = async (pinValue: string) => {
    if (!pinValue) return;
    
    try {
      const { data: childData } = await supabase
        .from('children')
        .select('nickname')
        .eq('pin', pinValue)
        .single();
      
      if (childData) {
        setNickname(childData.nickname);
      }
    } catch (err) {
      // PIN verification failed, but don't show error yet
      console.log('PIN verification:', err);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!pin || !selectedFile) {
      setError('PIN과 사진을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      // Find child by PIN
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*, family:families(*)')
        .eq('pin', pin)
        .single();

      if (childError || !childData) {
        throw new Error('PIN이 올바르지 않습니다.');
      }

      setNickname(childData.nickname);

      // Upload photo to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${childData.id}-${Date.now()}.${fileExt}`;
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
          child_id: childData.id,
          family_id: childData.family_id,
          photo_url: urlData.publicUrl,
          status: 'pending',
        });

      if (submissionError) throw submissionError;

      alert('사진이 성공적으로 업로드되었습니다!');
      setPin('');
      setSelectedFile(null);
      setPreview('');
      setNickname('');
    } catch (err: any) {
      setError(err.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header with greeting */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-800">
              {nickname ? `Hi, ${nickname} 👋` : 'ChoreMint'}
            </h1>
            {nickname && (
              <div className="bg-green-100 rounded-full px-4 py-2 flex items-center gap-1">
                <Icon name="star" size={16} />
                <span className="text-green-700 font-semibold text-sm">포인트</span>
              </div>
            )}
          </div>
          <p className="text-gray-600 text-sm">할 일 완료 사진을 업로드해주세요!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PIN Input Card */}
          <div className="bg-yellow-50 rounded-2xl p-5 shadow-md border-2 border-yellow-100">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              🔐 PIN 입력
            </label>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN을 입력하세요"
              className="w-full px-4 py-3 bg-white border-2 border-yellow-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all"
              required
            />
          </div>

          {/* Photo Upload Card */}
          <div className="bg-mint-50 rounded-2xl p-5 shadow-md border-2 border-green-100">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              📸 사진 선택
            </label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full px-4 py-3 bg-white border-2 border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                required
              />
            </div>
          </div>

          {/* Preview Card */}
          {preview && (
            <div className="bg-gray-50 rounded-2xl p-4 shadow-md border-2 border-gray-100">
              <p className="text-sm font-semibold text-gray-700 mb-2">📷 미리보기</p>
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
              <p className="text-sm text-red-700 font-medium">⚠️ {error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !pin || !selectedFile}
            className="w-full px-6 py-4 bg-gradient-to-r from-orange-400 to-pink-400 text-white rounded-2xl hover:from-orange-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> 업로드 중...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                ✅ 완료 사진 올리기
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}


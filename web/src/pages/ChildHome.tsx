import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChildHome() {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();

  const handleGoToUpload = () => {
    if (pin.trim()) {
      navigate(`/upload?pin=${pin.trim()}`);
    } else {
      alert('PIN을 입력해주세요!');
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">ChoreMint</h1>
          <p className="text-gray-600 mb-8">할 일 완료 사진을 올려요! 📸</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 text-left">
                🔐 PIN 입력
              </label>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGoToUpload()}
                placeholder="PIN을 입력하세요"
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-center text-lg font-semibold"
              />
            </div>
            
            <button
              onClick={handleGoToUpload}
              className="w-full px-6 py-4 bg-gradient-to-r from-orange-400 to-pink-400 text-white rounded-xl hover:from-orange-500 hover:to-pink-500 transition-all font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              시작하기 🚀
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              💡 PIN은 부모님께 받으세요!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


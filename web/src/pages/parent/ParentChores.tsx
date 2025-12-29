import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ParentTabNav from '../../components/ParentTabNav';
import Icon from '../../components/Icon';
import { sendPushNotification } from '../../lib/pushNotifications';

interface Chore {
  id: string;
  title: string;
  points: number;
  photo_required: boolean;
  active: boolean;
  steps?: ChoreStep[];
  icon?: string;
}

interface ChoreStep {
  order: number;
  description: string;
}

interface ChoreTemplate {
  id: string;
  title: string;
  points: number;
  steps: ChoreStep[];
  icon: string;
  category: string;
}

interface Child {
  id: string;
  nickname: string;
}

export default function ParentChores() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [newChoreTitle, setNewChoreTitle] = useState('');
  const [newChorePoints, setNewChorePoints] = useState<number | ''>('');
  const [newChoreSteps, setNewChoreSteps] = useState<ChoreStep[]>([]);
  const [newChoreIcon, setNewChoreIcon] = useState<string>('chore');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null); // 수정 중인 집안일 ID
  const [showTemplates, setShowTemplates] = useState(false); // 기본으로 숨김
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showFABMenu, setShowFABMenu] = useState(false); // 플러스 버튼 메뉴
  const [selectedChoreForAssign, setSelectedChoreForAssign] = useState<string | null>(null);
  const [assignDueDate, setAssignDueDate] = useState<string>('');
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [showChildSelection, setShowChildSelection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedChoreForDetail, setSelectedChoreForDetail] = useState<Chore | null>(null);
  const [selectedTemplateForDetail, setSelectedTemplateForDetail] = useState<ChoreTemplate | null>(null);
  // const [searchQuery, setSearchQuery] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/');
      return;
    }

    try {
      // Load family
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (familyData) {
        // Load chores (icon과 steps 컬럼이 없을 수 있으므로 명시적으로 컬럼 지정)
        const { data: choresData } = await supabase
          .from('chores')
          .select('id, title, points, photo_required, active, created_at, updated_at')
          .eq('family_id', familyData.id)
          .eq('active', true)
          .order('created_at', { ascending: false });

        if (choresData) {
          setChores(choresData);
        }

        // Load children
        const { data: childrenData } = await supabase
          .from('children')
          .select('id, nickname')
          .eq('family_id', familyData.id)
          .eq('active', true);

        if (childrenData) {
          setChildren(childrenData);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data } = await supabase
        .from('chore_templates')
        .select('*')
        .order('title');

      if (data) {
        setTemplates(data as ChoreTemplate[]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // 이모지를 이미지 아이콘 이름으로 변환하는 함수
  const getIconName = (icon: string | undefined): string => {
    if (!icon) return 'chore';
    
    // 이미 이미지 아이콘 이름인 경우
    if (!icon.match(/[\u{1F300}-\u{1F9FF}]/u)) {
      return icon;
    }
    
    // 이모지를 이미지 아이콘 이름으로 매핑
    const emojiToIconMap: Record<string, string> = {
      '🧹': 'broom',      // 방 청소하기
      '🛏️': 'bed',        // 침대 정리하기
      '🐕': 'dog',        // 강아지 밥 주기
      '🗑️': 'trash-can',  // 쓰레기 버리기
      '🍽️': 'dining',    // 식탁 정리하기, 설거지하기
      '🌱': 'plant',     // 화분 물주기
      '👟': 'shoe',      // 신발 정리하기
    };
    
    return emojiToIconMap[icon] || 'chore';
  };

  // 한국어 제목을 영어로 변환하는 함수
  const getEnglishTitle = (koreanTitle: string): string => {
    const titleMap: Record<string, string> = {
      '방 청소하기': 'Clean Room',
      '침대 정리하기': 'Make Bed',
      '강아지 밥 주기': 'Feed Pet',
      '쓰레기 버리기': 'Take Out Trash',
      '식탁 정리하기': 'Set the Table',
      '설거지하기': 'Wash Dishes',
      '화분 물주기': 'Water Plants',
      '신발 정리하기': 'Organize Shoes',
    };
    return titleMap[koreanTitle] || koreanTitle;
  };

  // 템플릿에서 바로 집안일 추가
  const handleAddFromTemplate = async (template: ChoreTemplate) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Login required.');

      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (!familyData) throw new Error('Family information not found.');

      // 영어 제목 사용
      const englishTitle = getEnglishTitle(template.title);

      // Create chore (steps와 icon은 제외 - 컬럼이 없을 수 있음)
      const insertData: any = {
        family_id: familyData.id,
        title: englishTitle,
        points: template.points,
        photo_required: true,
        active: true,
      };

      const { data: _newChore, error: choreError } = await supabase
        .from('chores')
        .insert(insertData)
        .select()
        .single();

      if (choreError) throw choreError;

      loadData();
    setShowTemplates(false);
      setShowCustomForm(false);
      setShowFABMenu(false);
      alert('Chore added successfully! You can now assign it to children.');
    } catch (error: any) {
      alert(error.message || 'Error occurred while adding chore.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStep = () => {
    setNewChoreSteps([...newChoreSteps, { order: newChoreSteps.length + 1, description: '' }]);
  };

  const handleRemoveStep = (index: number) => {
    const updatedSteps = newChoreSteps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      order: i + 1,
    }));
    setNewChoreSteps(updatedSteps);
  };

  const handleStepChange = (index: number, description: string) => {
    const updatedSteps = [...newChoreSteps];
    updatedSteps[index].description = description;
    setNewChoreSteps(updatedSteps);
  };

  const handleAddChore = async () => {
    if (!newChoreTitle.trim()) {
      alert('Please enter a chore title.');
      return;
    }

    // Validate points
    const pointsValue = newChorePoints === '' ? 1 : (typeof newChorePoints === 'number' ? newChorePoints : 1);
    if (pointsValue < 1) {
      alert('Please enter a value of 1 or greater for points.');
      return;
    }

    // Check if any step is empty
    if (newChoreSteps.length > 0) {
      const emptySteps = newChoreSteps.filter(step => !step.description.trim());
      if (emptySteps.length > 0) {
        alert('Please fill in all step descriptions.');
        return;
      }
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Login required.');

      if (editingChoreId) {
        // Update existing chore
        const pointsValue = newChorePoints === '' ? 1 : (typeof newChorePoints === 'number' ? newChorePoints : 1);
        const updateData: any = {
          title: newChoreTitle,
          points: pointsValue,
        };
        const { error: updateError } = await supabase
          .from('chores')
          .update(updateData)
          .eq('id', editingChoreId);

        if (updateError) throw updateError;

        alert('Chore updated successfully!');
      } else {
        // Create new chore
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (!familyData) throw new Error('Family information not found.');

        const pointsValue = newChorePoints === '' ? 1 : (typeof newChorePoints === 'number' ? newChorePoints : 1);
        const insertData: any = {
          family_id: familyData.id,
          title: newChoreTitle,
          points: pointsValue,
          photo_required: true,
          active: true,
        };
        const { data: _newChore, error: choreError } = await supabase
        .from('chores')
        .insert(insertData)
        .select()
        .single();

      if (choreError) throw choreError;

        alert('Chore added successfully! You can now assign it to children.');
      }

      // Reset form
      setNewChoreTitle('');
      setNewChorePoints('');
      setNewChoreSteps([]);
      setNewChoreIcon('chore');
      setEditingChoreId(null);
      setShowCustomForm(false);
      setShowTemplates(false);
      setShowFABMenu(false);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Error occurred while saving chore.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignChore = (choreId: string) => {
    if (children.length === 0) {
      alert('Please add children first.');
      return;
    }

      setSelectedChoreForAssign(choreId);
    setSelectedChildren([]);
      // Set default to today
      const today = new Date().toISOString().split('T')[0];
      setAssignDueDate(today);
    setShowChildSelection(true);
  };

  const handleToggleChildSelection = (childId: string) => {
    setSelectedChildren(prev => 
      prev.includes(childId) 
        ? prev.filter(id => id !== childId)
        : [...prev, childId]
    );
  };

  const handleConfirmAssignment = async () => {
    if (!selectedChoreForAssign || selectedChildren.length === 0) {
      alert('Please select at least one child.');
      return;
    }

    if (!assignDueDate) {
      alert('Please select a due date.');
      return;
    }

    setLoading(true);
    try {
      const assignments = selectedChildren.map(childId => ({
        chore_id: selectedChoreForAssign,
        child_id: childId,
        due_date: assignDueDate,
        status: 'todo',
      }));

      // Use upsert to avoid duplicates
      const { data: assignmentData, error } = await supabase
        .from('chore_assignments')
        .upsert(assignments, {
          onConflict: 'chore_id,child_id,due_date',
        })
        .select();

      if (error) {
        console.error('Error assigning chores:', error);
        console.error('Assignment data attempted:', assignments);
        throw error;
      }
      console.log('Assignments created successfully:', assignmentData);

      // 집안일 정보 가져오기
      const chore = chores.find(c => c.id === selectedChoreForAssign);
      
      // 선택한 자녀들에게만 푸시 알림 전송
      if (chore) {
          await Promise.all(
          selectedChildren.map(childId => {
            const child = children.find(c => c.id === childId);
            if (child) {
              return sendPushNotification(
                childId,
                'New chore assigned! 🧹',
                `Complete ${chore.title}`,
                '/child/today'
              );
            }
            return Promise.resolve();
          })
          );
        }

      const selectedNames = selectedChildren
        .map(id => children.find(c => c.id === id)?.nickname)
        .filter(Boolean)
        .join(', ');
      
      alert(`Chore assigned to ${selectedNames}!`);
      
      // Reset state
      setSelectedChoreForAssign(null);
      setSelectedChildren([]);
      setAssignDueDate('');
      setShowChildSelection(false);
      loadData();
      } catch (error: any) {
        alert(error.message || 'Error occurred while assigning.');
    } finally {
      setLoading(false);
    }
  };

  // 검색어로 필터링된 집안일 목록 (현재 사용하지 않음)
  // const filteredChores = chores.filter(chore =>
  //   chore.title.toLowerCase().includes(searchQuery.toLowerCase())
  // );

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-4xl mx-auto px-4 pt-6 sm:pt-8 pb-6">
        {/* Title - 좌측 정렬 */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Chores</h1>
        
        {/* Description - 좌측 정렬 */}
        <p className="text-sm sm:text-base text-gray-600 mb-6">
          Tap a template to assign a chore to your child.
        </p>
        
        {/* Templates Grid - Figma 디자인에 맞춘 템플릿 카드 그리드 */}
        {templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No templates available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {templates.map((template) => (
            /* DESIGN PATTERN: ChoreCard - 재사용 가능한 Chore 카드 컴포넌트
                - bg-[#B2F5EA]: 차분한 민트색 배경
                - border border-[#1E3A8A]: 차분한 남색 테두리
                - rounded-2xl: 둥근 모서리
                - hover:border-[#2563EB]: hover 시 테두리 색상 변경
                - active:scale-[0.98]: 클릭 시 살짝 작아지는 피드백
                - transition-all: 부드러운 애니메이션
                - cursor-pointer: 클릭 가능 표시 */
            <div
              key={template.id}
              className="bg-[#B2F5EA] border border-[#1E3A8A] rounded-2xl p-4 hover:border-[#2563EB] active:scale-[0.98] transition-all cursor-pointer"
              onClick={() => setSelectedTemplateForDetail(template)}
            >
              <div className="flex flex-col items-center">
                {/* DESIGN PATTERN: Icon - 재사용 가능한 아이콘
                    - mb-3: 아이콘과 텍스트 간 간격
                    - 아이콘을 카드 상단 중앙에 배치 */}
                {/* Icon - 상단 중앙 아이콘 */}
                <div className="mb-3">
                  <Icon name={getIconName(template.icon)} size={32} className="sm:w-10 sm:h-10 text-gray-800" />
                </div>
                
                {/* DESIGN PATTERN: Card Content - 재사용 가능한 카드 내용 영역
                    - text-center: 중앙 정렬
                    - 제목과 포인트를 세로로 배치 */}
                {/* Content - 중앙 정렬 텍스트 */}
                <div className="w-full text-center">
                  {/* Title */}
                  <h4 className="text-sm sm:text-base font-bold text-gray-800 mb-1 truncate">
                    {getEnglishTitle(template.title)}
                  </h4>
                  
                  {/* Points */}
                  <p className="text-xs sm:text-sm text-gray-500">
                    {template.points} points
                  </p>
                </div>
              </div>
            </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB (Floating Action Button) - 오른쪽 하단 */}
      <div className="fixed bottom-32 sm:bottom-28 right-6 sm:right-8 z-50">
        {/* FAB Menu - 위아래 배치, 텍스트는 한 줄로 (absolute positioning으로 플러스 버튼 위치에 영향 없음) */}
        {showFABMenu && (
          <div className="absolute bottom-full right-0 mb-3 flex flex-col gap-3">
            <button
              onClick={() => {
                setShowTemplates(true);
                setShowCustomForm(false);
                setShowFABMenu(false);
              }}
              className="px-5 sm:px-6 py-3 bg-white rounded-full shadow-lg text-[#F8D79F] font-semibold hover:bg-[#F8D79F] hover:text-gray-800 active:bg-[#F6D08A] transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer group text-sm sm:text-base min-h-[44px]"
            >
              <span className="group-hover:text-gray-800 transition-colors duration-200">Select Template</span>
            </button>
            <button
              onClick={() => {
                setShowTemplates(false);
                setShowCustomForm(true);
                setShowFABMenu(false);
              }}
              className="px-5 sm:px-6 py-3 bg-white rounded-full shadow-lg text-[#F8D79F] font-semibold hover:bg-[#F8D79F] hover:text-gray-800 active:bg-[#F6D08A] transition-all duration-200 flex items-center gap-2 whitespace-nowrap cursor-pointer group text-sm sm:text-base min-h-[44px]"
            >
              <span className="group-hover:text-gray-800 transition-colors duration-200">Create Custom</span>
            </button>
          </div>
        )}
        
        {/* FAB Button - 주황색으로 변경 */}
              <button
          onClick={() => setShowFABMenu(!showFABMenu)}
          className="w-14 h-14 sm:w-16 sm:h-16 bg-[#F8D79F] text-gray-800 rounded-full shadow-lg hover:bg-[#F6D08A] transition-all flex items-center justify-center text-2xl sm:text-3xl font-bold aspect-square"
              >
          {showFABMenu ? '×' : '+'}
              </button>
      </div>

      {/* Template Selection - 전체 화면 모달 */}
      {showTemplates && !showCustomForm && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto overscroll-contain">
          <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
            <div className="flex justify-between items-center mb-4 sm:mb-6 pt-4 sm:pt-8 gap-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0"></div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800 text-center flex-1 whitespace-nowrap">Select Template</h1>
              <button
                onClick={() => {
                  setShowTemplates(false);
                  setShowFABMenu(false);
                }}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-xl sm:text-2xl min-h-[44px] flex-shrink-0"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 pb-4">
                {templates.map((template) => (
                /* DESIGN PATTERN: TemplateCard - 재사용 가능한 템플릿 카드 컴포넌트
                    - bg-[#B2F5EA]: 차분한 민트색 배경
                    - border border-[#1E3A8A]: 차분한 남색 테두리
                    - rounded-3xl: 둥근 모서리
                    - hover:border-[#2563EB]: hover 시 테두리 색상 변경
                    - active:scale-[0.98]: 클릭 시 살짝 작아지는 피드백
                    - transition-all: 부드러운 애니메이션
                    - cursor-pointer: 클릭 가능 표시 */
                <div
                    key={template.id}
                  className="bg-[#B2F5EA] border border-[#1E3A8A] rounded-3xl p-4 hover:border-[#2563EB] active:scale-[0.98] transition-all cursor-pointer"
                  onClick={() => setSelectedTemplateForDetail(template)}
                  >
                  <div className="flex flex-col items-center">
                    {/* DESIGN PATTERN: Circular Icon - 재사용 가능한 원형 아이콘
                        - w-16 h-16: 고정 크기
                        - rounded-full: 완전한 원형
                        - border-2 border-[#1E3A8A]: 차분한 남색 테두리
                        - bg-white: 흰색 배경
                        - mb-3: 아이콘과 텍스트 간 간격
                        - 아이콘을 카드 상단 중앙에 배치 */}
                    {/* Icon - 상단 중앙 원형 아이콘 */}
                    <div className="w-16 h-16 rounded-full border-2 border-[#1E3A8A] bg-white flex items-center justify-center mb-3">
                      <Icon name={getIconName(template.icon)} size={24} className="sm:w-8 sm:h-8 text-gray-800" />
                    </div>
                    
                    {/* DESIGN PATTERN: Card Content - 재사용 가능한 카드 내용 영역
                        - text-center: 중앙 정렬
                        - 제목과 포인트를 세로로 배치 */}
                    {/* Content - 중앙 정렬 텍스트 */}
                    <div className="w-full text-center mb-3">
                      {/* Title */}
                      <h4 className="text-sm sm:text-base font-bold text-gray-800 mb-1 truncate">
                        {getEnglishTitle(template.title)}
                      </h4>
                      
                      {/* Points */}
                      <p className="text-xs sm:text-sm text-gray-500">
                        {template.points} points
                      </p>
                    </div>
                  
                    {/* DESIGN PATTERN: Add Button - 재사용 가능한 Add 버튼
                        - w-full: 전체 너비
                        - bg-[#1E3A8A]: 차분한 남색 배경
                        - text-white: 흰색 텍스트
                        - rounded-lg: 둥근 모서리
                        - hover:bg-[#2563EB]: hover 시 배경 색상 변경 */}
                    {/* Add Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddFromTemplate(template);
                      }}
                      disabled={loading}
                      className="w-full px-2 py-2 sm:py-1.5 bg-[#1E3A8A] text-white rounded-lg hover:bg-[#2563EB] transition-colors disabled:opacity-50 text-xs sm:text-sm font-semibold min-h-[44px]"
                    >
                      Add
                    </button>
                  </div>
                      </div>
                    ))}
                  </div>
          </div>
        </div>
      )}

      {/* Custom Form - 전체 화면 모달 */}
      {showCustomForm && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="max-w-2xl mx-auto px-6 sm:px-8 py-6 sm:py-8 pb-24">
            <div className="flex justify-between items-center mb-6 sm:mb-8 pt-2 sm:pt-4 gap-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0"></div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-800 text-center flex-1 whitespace-nowrap">{editingChoreId ? 'Edit Chore' : 'Create Custom'}</h1>
                  <button
                    onClick={() => {
                  setShowCustomForm(false);
                  setShowFABMenu(false);
                  setEditingChoreId(null);
                    }}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-xl sm:text-2xl min-h-[44px] flex-shrink-0"
                  >
                ×
                  </button>
            </div>
            
            <div className="space-y-4 sm:space-y-6">
              {/* Chore Title */}
              <div>
                <label className="block text-base sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">Chore Title</label>
              <input
                type="text"
                  placeholder="e.g., Water the plants"
                value={newChoreTitle}
                onChange={(e) => setNewChoreTitle(e.target.value)}
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-gray-50 border-2 border-gray-200 rounded-3xl focus:outline-none focus:border-orange-500 focus:bg-white transition-all text-base min-h-[44px]"
              />
              </div>

              {/* Points */}
              <div>
                <label className="block text-base sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">Points</label>
                <input
                  type="number"
                  value={newChorePoints}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setNewChorePoints('');
                    } else {
                      const numVal = parseInt(val);
                      setNewChorePoints(isNaN(numVal) ? '' : numVal);
                    }
                  }}
                  min="1"
                  placeholder="1"
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-gray-50 border-2 border-gray-200 rounded-3xl focus:outline-none focus:border-orange-500 focus:bg-white transition-all text-base placeholder:text-gray-400 min-h-[44px]"
                />
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-base sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">Icon</label>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-orange-100 rounded-3xl flex items-center justify-center flex-shrink-0">
                    <Icon name={newChoreIcon} size={24} className="sm:w-8 sm:h-8" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="px-4 sm:px-5 py-2.5 bg-[#F8D79F] text-gray-800 rounded-full hover:bg-[#F6D08A] transition-colors font-semibold flex items-center gap-2 text-sm sm:text-base min-h-[44px]"
                  >
                    <span className="text-lg sm:text-xl">+</span> Select Icon
                  </button>
                </div>
                {showIconPicker && (
                  <div className="mt-4 p-4 sm:p-5 bg-gray-50 rounded-3xl grid grid-cols-4 gap-3 sm:gap-4">
                    {['chore', 'bed', 'dog', 'broom', 'trash-can', 'dining', 'plant', 'shoe'].map((iconName) => (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => {
                          setNewChoreIcon(iconName);
                          setShowIconPicker(false);
                        }}
                        className={`w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-3xl flex items-center justify-center hover:bg-[#F8D79F] hover:bg-opacity-20 transition-all min-h-[44px] ${
                          newChoreIcon === iconName ? 'ring-4 ring-[#F8D79F] bg-[#F8D79F] bg-opacity-20' : ''
                        }`}
                      >
                        <Icon name={iconName} size={20} className="sm:w-7 sm:h-7" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Steps Section */}
              <div className="border-t-2 border-gray-200 pt-4 sm:pt-6">
                <div className="flex justify-between items-center mb-3 sm:mb-4">
                  <label className="text-base sm:text-lg font-semibold text-gray-800">Steps</label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-4 sm:px-5 py-2.5 bg-[#F8D79F] text-gray-800 rounded-full hover:bg-[#F6D08A] transition-colors font-semibold flex items-center gap-2 text-sm sm:text-base min-h-[44px]"
                  >
                    <span className="text-lg sm:text-xl">+</span> Add Step
                  </button>
                </div>
                {newChoreSteps.length === 0 ? (
                  <p className="text-xs sm:text-sm text-gray-500 text-center py-6 sm:py-8 bg-gray-50 rounded-3xl px-4">Add steps to help children complete chores more specifically.</p>
                ) : (
                  <div className="space-y-3">
                    {newChoreSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2 sm:gap-3">
                        <span className="text-sm sm:text-base font-semibold text-gray-600 w-8 sm:w-10 flex items-center justify-center flex-shrink-0">{step.order}.</span>
                        <input
                          type="text"
                          placeholder={`Step ${step.order} description`}
                          value={step.description}
                          onChange={(e) => handleStepChange(index, e.target.value)}
                          className="flex-1 px-4 sm:px-5 py-3 bg-gray-50 border-2 border-gray-200 rounded-3xl focus:outline-none focus:border-orange-500 focus:bg-white transition-all text-sm sm:text-base min-h-[44px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(index)}
                          className="w-11 h-11 sm:w-12 sm:h-12 text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex items-center justify-center flex-shrink-0 min-h-[44px]"
                        >
                          <Icon name="trash" size={18} className="sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save/Add Button */}
              <button
                onClick={handleAddChore}
                disabled={loading}
                className="w-full px-6 py-4 bg-[#F8D79F] text-gray-800 rounded-full hover:bg-[#F6D08A] transition-colors disabled:opacity-50 font-bold text-base sm:text-lg shadow-lg min-h-[44px]"
              >
                {loading ? 'Saving...' : (editingChoreId ? 'Save' : 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Assign Chore Modal with Child Selection */}
        {showChildSelection && selectedChoreForAssign && (
          <div className="fixed inset-0 backdrop-blur-md bg-black/20 flex items-center justify-center z-50 p-4 pointer-events-none">
            <div className="bg-white rounded-3xl shadow-xl max-w-md w-full px-5 py-6 sm:p-6 max-h-[80vh] overflow-y-auto pointer-events-auto my-2 mx-3" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="flex justify-between items-start mb-5">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 flex-1 pr-2">Assign Chore</h3>
                <button
                  onClick={() => {
                    setSelectedChoreForAssign(null);
                    setSelectedChildren([]);
                    setAssignDueDate('');
                    setShowChildSelection(false);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center min-h-[44px] flex-shrink-0"
                >
                  ×
                </button>
              </div>

              <div className="space-y-5 pb-2">
                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F8D79F] text-base min-h-[44px] bg-white appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-3">
                    Select Children
                  </label>
                  <div className="space-y-2">
                    {children.map((child) => (
                      <label
                        key={child.id}
                        className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors min-h-[44px]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedChildren.includes(child.id)}
                          onChange={() => handleToggleChildSelection(child.id)}
                          className="w-6 h-6 accent-orange-500 rounded focus:ring-2 focus:ring-[#F8D79F] flex-shrink-0"
                        />
                        <span className="text-base text-gray-800 font-medium">{child.nickname}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    onClick={() => {
                      setSelectedChoreForAssign(null);
                      setSelectedChildren([]);
                      setAssignDueDate('');
                      setShowChildSelection(false);
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-base font-semibold min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAssignment}
                    disabled={loading || selectedChildren.length === 0}
                    className="flex-1 px-4 py-3 bg-[#F8D79F] text-gray-800 rounded-lg hover:bg-[#F6D08A] transition-colors disabled:opacity-50 text-base font-semibold min-h-[44px]"
                  >
                    {loading ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Chore Detail Modal */}
      {selectedChoreForDetail && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/20 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800">Chore Details</h3>
              <button
                onClick={() => setSelectedChoreForDetail(null)}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-xl sm:text-2xl min-h-[44px]"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Icon and Title */}
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-orange-100 rounded-3xl flex items-center justify-center flex-shrink-0">
                  <Icon name={selectedChoreForDetail.icon || 'chore'} size={24} className="sm:w-8 sm:h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg sm:text-xl font-bold text-gray-800">{selectedChoreForDetail.title}</h4>
                  <p className="text-sm sm:text-base text-gray-600 mt-1 flex items-center gap-1">
                    <Icon name="star" size={14} className="sm:w-4 sm:h-4" />
                    {selectedChoreForDetail.points} pts
                  </p>
                </div>
              </div>

              {/* Steps */}
              {selectedChoreForDetail.steps && selectedChoreForDetail.steps.length > 0 && (
                <div>
                  <h5 className="text-base sm:text-lg font-semibold text-gray-800 mb-3">Steps</h5>
                  <div className="space-y-2">
                    {selectedChoreForDetail.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-2 sm:gap-3 p-3 bg-gray-50 rounded-2xl">
                        <span className="text-sm sm:text-base font-semibold text-gray-600 w-6 sm:w-8 flex items-center justify-center flex-shrink-0">{step.order}.</span>
                        <p className="flex-1 text-sm sm:text-base text-gray-700">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setNewChoreTitle(selectedChoreForDetail.title);
                    setNewChorePoints(selectedChoreForDetail.points);
                    setNewChoreSteps(selectedChoreForDetail.steps || []);
                    setNewChoreIcon(selectedChoreForDetail.icon || 'chore');
                    setEditingChoreId(selectedChoreForDetail.id);
                    setShowCustomForm(true);
                    setShowTemplates(false);
                    setShowFABMenu(false);
                    setSelectedChoreForDetail(null);
                  }}
                  className="flex-1 px-4 py-3 bg-[#F8D79F] text-gray-800 rounded-full hover:bg-[#F6D08A] transition-colors font-semibold text-sm sm:text-base min-h-[44px]"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    handleAssignChore(selectedChoreForDetail.id);
                    setSelectedChoreForDetail(null);
                  }}
                  className="flex-1 px-4 py-3 bg-[#F8D79F] text-gray-800 rounded-full hover:bg-[#F6D08A] transition-colors font-semibold text-sm sm:text-base min-h-[44px]"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Detail Modal */}
      {selectedTemplateForDetail && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/20 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800">Template Details</h3>
              <button
                onClick={() => setSelectedTemplateForDetail(null)}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-xl sm:text-2xl min-h-[44px]"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Icon and Title */}
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-orange-100 rounded-3xl flex items-center justify-center flex-shrink-0">
                  <Icon name={getIconName(selectedTemplateForDetail.icon)} size={24} className="sm:w-8 sm:h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg sm:text-xl font-bold text-gray-800">{getEnglishTitle(selectedTemplateForDetail.title)}</h4>
                  <p className="text-sm sm:text-base text-gray-600 mt-1 flex items-center gap-1">
                    <Icon name="star" size={14} className="sm:w-4 sm:h-4" />
                    {selectedTemplateForDetail.points} pts
                  </p>
                </div>
              </div>

              {/* Steps */}
              {selectedTemplateForDetail.steps && selectedTemplateForDetail.steps.length > 0 && (
                <div>
                  <h5 className="text-base sm:text-lg font-semibold text-gray-800 mb-3">Steps</h5>
                  <div className="space-y-2">
                    {selectedTemplateForDetail.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-2 sm:gap-3 p-3 bg-gray-50 rounded-2xl">
                        <span className="text-sm sm:text-base font-semibold text-gray-600 w-6 sm:w-8 flex items-center justify-center flex-shrink-0">{step.order}.</span>
                        <p className="flex-1 text-sm sm:text-base text-gray-700">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    // Create chore from template first
                    setLoading(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) throw new Error('Login required.');

                      const { data: familyData } = await supabase
                        .from('families')
                        .select('*')
                        .eq('parent_id', session.user.id)
                        .single();

                      if (!familyData) throw new Error('Family information not found.');

                      const englishTitle = getEnglishTitle(selectedTemplateForDetail.title);

                      const insertData: any = {
                        family_id: familyData.id,
                        title: englishTitle,
                        points: selectedTemplateForDetail.points,
                        photo_required: true,
                        active: true,
                      };

                      const { data: newChore, error: choreError } = await supabase
                        .from('chores')
                        .insert(insertData)
                        .select()
                        .single();

                      if (choreError) throw choreError;

                      // Proceed to assign flow with created chore
                      if (newChore) {
                        setSelectedChoreForAssign(newChore.id);
                        setShowChildSelection(true);
                        setSelectedTemplateForDetail(null);
                      }
                    } catch (error: any) {
                      alert(error.message || 'Error occurred while creating chore.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-[#F8D79F] text-gray-800 rounded-lg hover:bg-[#F6D08A] transition-colors disabled:opacity-50 font-semibold text-sm sm:text-base min-h-[44px]"
                >
                  {loading ? 'Creating...' : 'Assign'}
                </button>
                <button
                  onClick={() => {
                    // Fill edit form with template data
                    setNewChoreTitle(getEnglishTitle(selectedTemplateForDetail.title));
                    setNewChorePoints(selectedTemplateForDetail.points);
                    setNewChoreSteps(selectedTemplateForDetail.steps || []);
                    setNewChoreIcon(getIconName(selectedTemplateForDetail.icon));
                    setEditingChoreId(null); // null because creating new
                    setShowCustomForm(true);
                    setSelectedTemplateForDetail(null);
                    setShowFABMenu(false);
                  }}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold text-sm sm:text-base min-h-[44px]"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
      </div>
      )}

      <ParentTabNav />
    </div>
  );
}


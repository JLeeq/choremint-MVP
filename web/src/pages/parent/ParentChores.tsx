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
  const [newChorePoints, setNewChorePoints] = useState(10);
  const [newChoreSteps, setNewChoreSteps] = useState<ChoreStep[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(false);
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
        // Load chores
        const { data: choresData } = await supabase
          .from('chores')
          .select('*')
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
          .eq('family_id', familyData.id);

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

  const handleTemplateSelect = (template: ChoreTemplate) => {
    setNewChoreTitle(template.title);
    setNewChorePoints(template.points);
    setNewChoreSteps(template.steps || []);
    setShowTemplates(false);
    setShowAddForm(true);
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
      alert('집안일 제목을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('parent_id', session.user.id)
        .single();

      if (!familyData) throw new Error('가족 정보를 찾을 수 없습니다.');

      // Create chore with steps
      const { data: newChore, error: choreError } = await supabase
        .from('chores')
        .insert({
          family_id: familyData.id,
          title: newChoreTitle,
          points: newChorePoints,
          photo_required: true,
          active: true,
          steps: newChoreSteps.length > 0 ? newChoreSteps : null,
        })
        .select()
        .single();

      if (choreError) throw choreError;

      // Automatically assign to all children for today
      if (children.length > 0 && newChore) {
        const today = new Date().toISOString().split('T')[0];
        const assignments = children.map(child => ({
          chore_id: newChore.id,
          child_id: child.id,
          due_date: today,
          status: 'todo',
        }));

        const { error: assignmentError } = await supabase
          .from('chore_assignments')
          .upsert(assignments, {
            onConflict: 'chore_id,child_id,due_date',
          });

        if (assignmentError) {
          console.error('Error assigning chore to children:', assignmentError);
          // Chore was created but assignment failed - still show success
          alert('집안일이 추가되었지만 자녀에게 할당하는 중 오류가 발생했습니다.');
        } else {
          // 각 자녀에게 푸시 알림 전송
          await Promise.all(
            children.map(child =>
              sendPushNotification(
                child.id, // 자녀 ID
                '새로운 집안일이 할당되었습니다! 🧹',
                `${newChoreTitle}을(를) 완료해보세요`,
                '/child/today'
              )
            )
          );
        }
      }

      setNewChoreTitle('');
      setNewChorePoints(10);
      setNewChoreSteps([]);
      setShowAddForm(false);
      loadData();
      
      if (children.length > 0) {
        alert('집안일이 추가되었고 모든 자녀에게 할당되었습니다!');
      } else {
        alert('집안일이 추가되었습니다. 자녀를 추가한 후 "할당" 버튼을 눌러주세요.');
      }
    } catch (error: any) {
      alert(error.message || '집안일 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToAll = async (choreId: string) => {
    if (children.length === 0) {
      alert('자녀를 먼저 추가해주세요.');
      return;
    }

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const assignments = children.map(child => ({
        chore_id: choreId,
        child_id: child.id,
        due_date: today,
        status: 'todo',
      }));

      // Use upsert to avoid duplicates
      const { error } = await supabase
        .from('chore_assignments')
        .upsert(assignments, {
          onConflict: 'chore_id,child_id,due_date',
        });

      if (error) throw error;

      // 집안일 정보 가져오기
      const chore = chores.find(c => c.id === choreId);
      
      // 각 자녀에게 푸시 알림 전송
      if (chore) {
        await Promise.all(
          children.map(child =>
            sendPushNotification(
              child.id,
              '새로운 집안일이 할당되었습니다! 🧹',
              `${chore.title}을(를) 완료해보세요`,
              '/child/today'
            )
          )
        );
      }

      alert('모든 자녀에게 할 일이 할당되었습니다!');
    } catch (error: any) {
      alert(error.message || '할당 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChore = async (choreId: string) => {
    const chore = chores.find(c => c.id === choreId);
    if (!chore) return;

    const confirmed = window.confirm(
      `"${chore.title}" 집안일을 삭제하시겠습니까?\n\n이 집안일과 관련된 할당 정보도 함께 삭제됩니다.`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('chores')
        .delete()
        .eq('id', choreId);

      if (error) throw error;

      alert('집안일이 삭제되었습니다.');
      loadData();
    } catch (error: any) {
      alert(error.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800">집안일 관리</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                📋 템플릿
              </button>
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  setShowTemplates(false);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {showAddForm ? '취소' : '+ 추가'}
              </button>
            </div>
          </div>

          {/* 템플릿 선택 */}
          {showTemplates && (
            <div className="mb-4 p-4 bg-purple-50 rounded-lg">
              <h3 className="font-bold text-gray-800 mb-3">템플릿 선택</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className="p-3 bg-white rounded-lg border-2 border-purple-200 hover:border-purple-400 transition-colors text-left"
                  >
                    <div className="text-2xl mb-1">{template.icon}</div>
                    <div className="text-sm font-semibold text-gray-800">{template.title}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Icon name="star" size={12} />
                      {template.points}점
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showAddForm && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <input
                type="text"
                placeholder="집안일 제목"
                value={newChoreTitle}
                onChange={(e) => setNewChoreTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-4">
                <label className="text-sm text-gray-600">포인트:</label>
                <input
                  type="number"
                  value={newChorePoints}
                  onChange={(e) => setNewChorePoints(parseInt(e.target.value) || 10)}
                  min="1"
                  className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 단계 추가 섹션 */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-gray-700">단계별 요청 사항</label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    + 단계 추가
                  </button>
                </div>
                {newChoreSteps.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">단계를 추가하면 자녀가 더 구체적으로 집안일을 수행할 수 있습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {newChoreSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600 w-8">{step.order}.</span>
                        <input
                          type="text"
                          placeholder={`단계 ${step.order} 설명`}
                          value={step.description}
                          onChange={(e) => handleStepChange(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(index)}
                          className="px-3 py-2 text-red-500 hover:bg-red-50 rounded text-sm"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddChore}
                disabled={loading}
                className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                추가
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {chores.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <p className="text-gray-500">등록된 집안일이 없습니다.</p>
            </div>
          ) : (
            chores.map((chore) => (
              <div key={chore.id} className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-800">{chore.title}</h3>
                    <p className="text-gray-600 mt-1 flex items-center gap-1">
                      <Icon name="star" size={16} />
                      {chore.points}점
                    </p>
                    {chore.steps && chore.steps.length > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        {chore.steps.length}개 단계
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteChore(chore.id)}
                    disabled={loading}
                    className="ml-4 px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="삭제"
                  >
                    🗑️
                  </button>
                </div>
                <button
                  onClick={() => handleAssignToAll(chore.id)}
                  disabled={loading || children.length === 0}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  모든 자녀에게 할당
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <ParentTabNav />
    </div>
  );
}


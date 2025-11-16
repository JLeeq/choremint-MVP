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
  const [newChorePoints, setNewChorePoints] = useState(10);
  const [newChoreSteps, setNewChoreSteps] = useState<ChoreStep[]>([]);
  const [newChoreIcon, setNewChoreIcon] = useState<string>('chore');
  const [newChoreDueDate, setNewChoreDueDate] = useState<string>('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChoreTemplate | null>(null);
  const [showTemplateDetail, setShowTemplateDetail] = useState(false);
  const [selectedChoreForAssign, setSelectedChoreForAssign] = useState<string | null>(null);
  const [assignDueDate, setAssignDueDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const assignButtonLabel =
    children.length === 1 ? `${children[0].nickname}에게 할당` : 'Assign to All Children';

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

  const handleTemplateClick = (template: ChoreTemplate) => {
    setSelectedTemplate(template);
    setShowTemplateDetail(true);
  };

  const handleTemplateSelect = (template: ChoreTemplate) => {
    setNewChoreTitle(template.title);
    setNewChorePoints(template.points);
    setNewChoreSteps(template.steps || []);
    // Use template icon if it's an SVG name, otherwise default to 'chore'
    setNewChoreIcon(template.icon && !template.icon.match(/[\u{1F300}-\u{1F9FF}]/u) ? template.icon : 'chore');
    // Set default due date to today
    const today = new Date().toISOString().split('T')[0];
    setNewChoreDueDate(today);
    setShowTemplates(false);
    setShowTemplateDetail(false);
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
      alert('Please enter a chore title.');
      return;
    }

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

      // Create chore with steps and icon
      const { data: newChore, error: choreError } = await supabase
        .from('chores')
        .insert({
          family_id: familyData.id,
          title: newChoreTitle,
          points: newChorePoints,
          photo_required: true,
          active: true,
          steps: newChoreSteps.length > 0 ? newChoreSteps : null,
          icon: newChoreIcon,
        })
        .select()
        .single();

      if (choreError) throw choreError;

      // Automatically assign to all children with the specified due date (if no due date specified, use today)
      if (children.length > 0 && newChore) {
        const today = new Date().toISOString().split('T')[0];
        const dueDate = newChoreDueDate || today;
        const assignments = children.map(child => ({
          chore_id: newChore.id,
          child_id: child.id,
          due_date: dueDate,
          status: 'todo',
        }));

        const { data: assignmentData, error: assignmentError } = await supabase
          .from('chore_assignments')
          .upsert(assignments, {
            onConflict: 'chore_id,child_id,due_date',
          })
          .select();

        if (assignmentError) {
          console.error('Error assigning chore to children:', assignmentError);
          console.error('Assignment data attempted:', assignments);
          // Chore was created but assignment failed - still show success
          alert('Chore added but error occurred while assigning to children.');
        } else {
          console.log('Assignments created successfully:', assignmentData);
          // Send push notifications to each child
          await Promise.all(
            children.map(child =>
              sendPushNotification(
                child.id, // Child ID
                'New chore assigned! 🧹',
                `Complete ${newChoreTitle}`,
                '/child/today'
              )
            )
          );
        }
      }

      setNewChoreTitle('');
      setNewChorePoints(10);
      setNewChoreSteps([]);
      setNewChoreIcon('chore');
      setNewChoreDueDate('');
      setShowAddForm(false);
      loadData();
      
      if (children.length > 0) {
        alert('Chore added and assigned to all children!');
      } else {
        alert('Chore added. Please add children and use the "Assign" button.');
      }
    } catch (error: any) {
      alert(error.message || 'Error occurred while adding chore.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToAll = async (choreId: string, dueDate?: string) => {
    if (children.length === 0) {
      alert('Please add children first.');
      return;
    }

    // If due date is provided, use it; otherwise show date picker
    if (!dueDate) {
      setSelectedChoreForAssign(choreId);
      // Set default to today
      const today = new Date().toISOString().split('T')[0];
      setAssignDueDate(today);
      return;
    }

    setLoading(true);
    try {
      const assignments = children.map(child => ({
        chore_id: choreId,
        child_id: child.id,
        due_date: dueDate,
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
      const chore = chores.find(c => c.id === choreId);
      
      // 각 자녀에게 푸시 알림 전송
      if (chore) {
          await Promise.all(
            children.map(child =>
              sendPushNotification(
                child.id,
                'New chore assigned! 🧹',
                `Complete ${chore.title}`,
                '/child/today'
              )
            )
          );
        }

        alert('Chore assigned to all children!');
      } catch (error: any) {
        alert(error.message || 'Error occurred while assigning.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChore = async (choreId: string) => {
    const chore = chores.find(c => c.id === choreId);
    if (!chore) return;

      const confirmed = window.confirm(
        `Delete "${chore.title}" chore?\n\nAll related assignments will also be deleted.`
      );

    if (!confirmed) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('chores')
        .delete()
        .eq('id', choreId);

      if (error) throw error;

      alert('Chore deleted.');
      loadData();
    } catch (error: any) {
      alert(error.message || 'Error occurred while deleting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800">Chores</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                📋 Templates
              </button>
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  setShowTemplates(false);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {showAddForm ? 'Cancel' : '+ Add'}
              </button>
            </div>
          </div>

          {/* Template Selection */}
          {showTemplates && (
            <div className="mb-4">
              <h3 className="font-bold text-gray-800 mb-4">Select Template</h3>
              <div className="grid grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className="bg-white rounded-2xl shadow-lg p-4 hover:shadow-xl transition-shadow text-left"
                  >
                    {/* Icon background */}
                    <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
                      {template.icon && !template.icon.match(/[\u{1F300}-\u{1F9FF}]/u) ? (
                        <Icon name={template.icon} size={32} />
                      ) : template.icon ? (
                        <span className="text-3xl">{template.icon}</span>
                      ) : (
                        <Icon name="chore" size={32} />
                      )}
                    </div>
                    
                    {/* Title */}
                    <h4 className="text-lg font-bold text-gray-800">
                      {template.title}
                    </h4>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 템플릿 상세 모달 */}
          {showTemplateDetail && selectedTemplate && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
                      {selectedTemplate.icon && !selectedTemplate.icon.match(/[\u{1F300}-\u{1F9FF}]/u) ? (
                        <Icon name={selectedTemplate.icon} size={32} />
                      ) : selectedTemplate.icon ? (
                        <span className="text-3xl">{selectedTemplate.icon}</span>
                      ) : (
                        <Icon name="chore" size={32} />
                      )}
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">
                      {selectedTemplate.title}
                    </h3>
                    <p className="text-gray-600 flex items-center gap-1">
                      <Icon name="star" size={16} />
                      {selectedTemplate.points} points
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTemplateDetail(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>

                {selectedTemplate.steps && selectedTemplate.steps.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-800 mb-2">Steps:</h4>
                    {selectedTemplate.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="font-bold text-[#5CE1C6] w-6">{step.order}.</span>
                        <p className="text-gray-700 flex-1">{step.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No steps defined</p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowTemplateDetail(false);
                      setShowTemplates(false);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleTemplateSelect(selectedTemplate)}
                    className="flex-1 px-4 py-2 bg-[#5CE1C6] text-white rounded-lg hover:bg-[#4ECDC4] transition-colors"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            </div>
          )}

          {showAddForm && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <input
                type="text"
                placeholder="Chore Title"
                value={newChoreTitle}
                onChange={(e) => setNewChoreTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-4">
                <label className="text-sm text-gray-600">Points:</label>
                <input
                  type="number"
                  value={newChorePoints}
                  onChange={(e) => setNewChorePoints(parseInt(e.target.value) || 10)}
                  min="1"
                  className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Due Date Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Due Date
                </label>
                <input
                  type="date"
                  value={newChoreDueDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setNewChoreDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Icon
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <Icon name={newChoreIcon} size={24} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                  >
                    Select Icon
                  </button>
                </div>
                {showIconPicker && (
                  <div className="mt-3 p-4 bg-white rounded-lg border border-gray-200 grid grid-cols-4 gap-3">
                    {['chore', 'bed', 'dog', 'broom', 'trash-can', 'dining', 'plant', 'shoe'].map((iconName) => (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => {
                          setNewChoreIcon(iconName);
                          setShowIconPicker(false);
                        }}
                        className={`w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center hover:bg-orange-200 transition-colors ${
                          newChoreIcon === iconName ? 'ring-2 ring-[#5CE1C6]' : ''
                        }`}
                      >
                        <Icon name={iconName} size={20} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Steps Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-gray-700">Steps</label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    + Add Step
                  </button>
                </div>
                {newChoreSteps.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Add steps to help children complete chores more specifically.</p>
                ) : (
                  <div className="space-y-2">
                    {newChoreSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600 w-8">{step.order}.</span>
                        <input
                          type="text"
                          placeholder={`Step ${step.order} description`}
                          value={step.description}
                          onChange={(e) => handleStepChange(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(index)}
                        className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm"
                        >
                          Delete
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
                Add
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {chores.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <p className="text-gray-500">No chores registered.</p>
            </div>
          ) : (
            chores.map((chore) => (
              <div key={chore.id} className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-800">{chore.title}</h3>
                    <p className="text-gray-600 mt-1 flex items-center gap-1">
                      <Icon name="star" size={16} />
                      {chore.points} pts
                    </p>
                    {chore.steps && chore.steps.length > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        {chore.steps.length} steps
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteChore(chore.id)}
                    disabled={loading}
                    className="ml-4 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
                <button
                  onClick={() => handleAssignToAll(chore.id)}
                  disabled={loading || children.length === 0}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {assignButtonLabel}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Assign with Due Date Modal */}
        {selectedChoreForAssign && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-bold text-gray-800">Assign Chore</h3>
                <button
                  onClick={() => {
                    setSelectedChoreForAssign(null);
                    setAssignDueDate('');
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedChoreForAssign(null);
                      setAssignDueDate('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!assignDueDate) {
                        alert('Please select a due date');
                        return;
                      }
                      await handleAssignToAll(selectedChoreForAssign, assignDueDate);
                      setSelectedChoreForAssign(null);
                      setAssignDueDate('');
                    }}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Assign
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


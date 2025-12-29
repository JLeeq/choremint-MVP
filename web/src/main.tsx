import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import LoginSelect from './pages/LoginSelect.tsx'
// Parent pages
import ParentHome from './pages/parent/ParentHome.tsx'
import ParentChores from './pages/parent/ParentChores.tsx'
import ParentApprovals from './pages/parent/ParentApprovals.tsx'
import ParentRewards from './pages/parent/ParentRewards.tsx'
import ParentProfile from './pages/parent/ParentProfile.tsx'
import ParentChildSettings from './pages/parent/ParentChildSettings.tsx'
// Child pages
import ChildToday from './pages/child/ChildToday.tsx'
import ChildUpload from './pages/child/ChildUpload.tsx'
import ChildCharacter from './pages/child/ChildCharacter.tsx'
import ChildRewards from './pages/child/ChildRewards.tsx'
import ChildProfile from './pages/child/ChildProfile.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginSelect />} />
        <Route path="/parent-login" element={<Navigate to="/" replace />} />
        <Route path="/child-login" element={<Navigate to="/" replace />} />
        
        {/* Parent routes */}
        <Route path="/parent/home" element={<ParentHome />} />
        <Route path="/parent/chores" element={<ParentChores />} />
        <Route path="/parent/approvals" element={<ParentApprovals />} />
        <Route path="/parent/rewards" element={<ParentRewards />} />
        <Route path="/parent/profile" element={<ParentProfile />} />
        <Route path="/parent/child/:childId/settings" element={<ParentChildSettings />} />
        <Route path="/dashboard" element={<Navigate to="/parent/home" replace />} />
        
        {/* Child routes */}
        <Route path="/child/today" element={<ChildToday />} />
        <Route path="/child/upload" element={<ChildUpload />} />
        <Route path="/child/character" element={<ChildCharacter />} />
        <Route path="/child/rewards" element={<ChildRewards />} />
        <Route path="/child/profile" element={<ChildProfile />} />
        <Route path="/child-dashboard" element={<Navigate to="/child/today" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

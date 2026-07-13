import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CookieConsent from './components/CookieConsent.jsx'
import InstallPWA from './components/InstallPWA.jsx'
import { useAuthStore } from './store/auth.js'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Landing from './pages/Landing.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LessonList from './pages/LessonList.jsx'
import NewLesson from './pages/NewLesson.jsx'
import ExerciseSession from './pages/ExerciseSession.jsx'
import Vocabulary from './pages/Vocabulary.jsx'
import Students from './pages/Students.jsx'
import CourseList from './pages/CourseList.jsx'
import CourseView from './pages/CourseView.jsx'
import Wiki from './pages/Wiki.jsx'
import Grammar from './pages/Grammar.jsx'
import LoveKids from './pages/LoveKids.jsx'
import Crossword from './pages/Crossword.jsx'
import Tutors from './pages/Tutors.jsx'
import TextReader from './pages/TextReader.jsx'
import Report from './pages/Report.jsx'
import Phrasebook from './pages/Phrasebook.jsx'
import Translations from './pages/Translations.jsx'
import Settings from './pages/Settings.jsx'
import Docs from './pages/Docs.jsx'
import Chat from './pages/Chat.jsx'
import WordMatch from './pages/WordMatch.jsx'
import Privacy from './pages/Privacy.jsx'
import Terms from './pages/Terms.jsx'
import Cookies from './pages/Cookies.jsx'
import Profile from './pages/Profile.jsx'
import AiTrainer from './pages/AiTrainer.jsx'
import Admin from './pages/Admin.jsx'
import Layout from './components/Layout.jsx'

function ProtectedRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

function HomeRoute() {
  const { token } = useAuthStore()
  return token ? <Layout><Dashboard /></Layout> : <Landing />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/lessons" element={<ProtectedRoute><Layout><LessonList /></Layout></ProtectedRoute>} />
        <Route path="/lessons/new" element={<ProtectedRoute><Layout><NewLesson /></Layout></ProtectedRoute>} />
        <Route path="/exercise-session" element={<ProtectedRoute><Layout><ExerciseSession /></Layout></ProtectedRoute>} />
        <Route path="/vocabulary" element={<ProtectedRoute><Layout><Vocabulary /></Layout></ProtectedRoute>} />
        <Route path="/students"    element={<ProtectedRoute><Layout><Students   /></Layout></ProtectedRoute>} />
        <Route path="/courses"     element={<ProtectedRoute><Layout><CourseList /></Layout></ProtectedRoute>} />
        <Route path="/courses/:id" element={<ProtectedRoute><Layout><CourseView /></Layout></ProtectedRoute>} />
        <Route path="/wiki"        element={<ProtectedRoute><Layout><Wiki       /></Layout></ProtectedRoute>} />
        <Route path="/grammar"     element={<ProtectedRoute><Layout><Grammar    /></Layout></ProtectedRoute>} />
        <Route path="/love"        element={<ProtectedRoute><Layout><LoveKids   /></Layout></ProtectedRoute>} />
        <Route path="/tutors"      element={<ProtectedRoute><Layout><Tutors     /></Layout></ProtectedRoute>} />
        <Route path="/reader"      element={<ProtectedRoute><Layout><TextReader /></Layout></ProtectedRoute>} />
        <Route path="/report"      element={<ProtectedRoute><Layout><Report       /></Layout></ProtectedRoute>} />
        <Route path="/phrasebook"    element={<ProtectedRoute><Layout><Phrasebook    /></Layout></ProtectedRoute>} />
        <Route path="/translations"  element={<ProtectedRoute><Layout><Translations  /></Layout></ProtectedRoute>} />
        <Route path="/settings"      element={<ProtectedRoute><Layout><Settings      /></Layout></ProtectedRoute>} />
        <Route path="/chat"          element={<ProtectedRoute><Layout><Chat           /></Layout></ProtectedRoute>} />
        <Route path="/game/match"    element={<ProtectedRoute><Layout><WordMatch      /></Layout></ProtectedRoute>} />
        <Route path="/game/crossword" element={<ProtectedRoute><Layout><Crossword     /></Layout></ProtectedRoute>} />
        <Route path="/profile"    element={<ProtectedRoute><Layout><Profile    /></Layout></ProtectedRoute>} />
        <Route path="/ai-trainer" element={<ProtectedRoute><Layout><AiTrainer /></Layout></ProtectedRoute>} />
        <Route path="/admin"      element={<ProtectedRoute><Layout><Admin      /></Layout></ProtectedRoute>} />
        <Route path="/docs"    element={<Docs />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms"   element={<Terms />} />
        <Route path="/cookies" element={<Cookies />} />
      </Routes>
      <CookieConsent />
      <InstallPWA />
    </BrowserRouter>
  )
}

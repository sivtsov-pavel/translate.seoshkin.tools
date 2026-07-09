import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.js'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LessonList from './pages/LessonList.jsx'
import NewLesson from './pages/NewLesson.jsx'
import ExerciseSession from './pages/ExerciseSession.jsx'
import Vocabulary from './pages/Vocabulary.jsx'
import Students from './pages/Students.jsx'
import CourseList from './pages/CourseList.jsx'
import CourseView from './pages/CourseView.jsx'
import Wiki from './pages/Wiki.jsx'
import TextReader from './pages/TextReader.jsx'
import Report from './pages/Report.jsx'
import Layout from './components/Layout.jsx'

function ProtectedRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/lessons" element={<ProtectedRoute><Layout><LessonList /></Layout></ProtectedRoute>} />
        <Route path="/lessons/new" element={<ProtectedRoute><Layout><NewLesson /></Layout></ProtectedRoute>} />
        <Route path="/exercise-session" element={<ProtectedRoute><Layout><ExerciseSession /></Layout></ProtectedRoute>} />
        <Route path="/vocabulary" element={<ProtectedRoute><Layout><Vocabulary /></Layout></ProtectedRoute>} />
        <Route path="/students"    element={<ProtectedRoute><Layout><Students   /></Layout></ProtectedRoute>} />
        <Route path="/courses"     element={<ProtectedRoute><Layout><CourseList /></Layout></ProtectedRoute>} />
        <Route path="/courses/:id" element={<ProtectedRoute><Layout><CourseView /></Layout></ProtectedRoute>} />
        <Route path="/wiki"        element={<ProtectedRoute><Layout><Wiki       /></Layout></ProtectedRoute>} />
        <Route path="/reader"      element={<ProtectedRoute><Layout><TextReader /></Layout></ProtectedRoute>} />
        <Route path="/report"      element={<ProtectedRoute><Layout><Report     /></Layout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}

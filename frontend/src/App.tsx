import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { GeneratePage } from './pages/GeneratePage'
import { CallbackPage } from './pages/CallbackPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<CallbackPage />} />

          <Route
            path="/generate"
            element={
              <ProtectedRoute>
                <GeneratePage />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/generate" replace />} />
          <Route path="*" element={<Navigate to="/generate" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
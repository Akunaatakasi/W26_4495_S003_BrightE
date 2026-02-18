import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import NewTriage from './pages/NewTriage';
import NurseDashboard from './pages/NurseDashboard';
import NurseCase from './pages/NurseCase';
import AuditLog from './pages/AuditLog';
import DoctorDashboard from './pages/DoctorDashboard';
import DoctorCase from './pages/DoctorCase';

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/staff" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="staff" element={<Login />} />
        <Route path="staff/register" element={<Register />} />
        <Route path="login" element={<Navigate to="/staff" replace />} />
        <Route path="triage/new" element={<NewTriage />} />
        <Route path="nurse" element={<PrivateRoute role="nurse"><NurseDashboard /></PrivateRoute>} />
        <Route path="nurse/case/:id" element={<PrivateRoute role="nurse"><NurseCase /></PrivateRoute>} />
        <Route path="nurse/audit" element={<PrivateRoute role="nurse"><AuditLog /></PrivateRoute>} />
        <Route path="doctor" element={<PrivateRoute role="doctor"><DoctorDashboard /></PrivateRoute>} />
        <Route path="doctor/case/:id" element={<PrivateRoute role="doctor"><DoctorCase /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

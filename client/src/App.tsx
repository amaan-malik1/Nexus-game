import { Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import PlayerGame from "./pages/PlayerGame";
import ProjectorView from "./pages/ProjectorView";
import { ToastHost } from "./components/Toast";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/projector" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        <Route path="/play" element={<PlayerGame />} />
        <Route path="/projector" element={<ProjectorView />} />
        <Route path="*" element={<Navigate to="/projector" replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}

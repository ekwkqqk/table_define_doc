import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import ConnectionsPage from "./pages/ConnectionsPage";
import ExplorePage from "./pages/ExplorePage";
import SnapshotPage from "./pages/SnapshotPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">테이블 정의서</div>
        <nav className="nav">
          <NavLink to="/connections" className={({ isActive }) => (isActive ? "active" : "")}>
            연결 관리
          </NavLink>
          <NavLink to="/explore" className={({ isActive }) => (isActive ? "active" : "")}>
            탐색 / 생성
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
            설정
          </NavLink>
        </nav>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/connections" replace />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/snapshots/:id" element={<SnapshotPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

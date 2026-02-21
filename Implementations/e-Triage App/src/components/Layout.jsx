import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>e - Triage</Link>
        <nav className={styles.nav}>
          {!user && (
            <>
              <Link to="/triage/new">Start triage</Link>
              <Link to="/staff">Staff</Link>
            </>
          )}
          {user?.role === 'nurse' && (
            <>
              <Link to="/nurse">Queue</Link>
              <Link to="/nurse/audit">Audit log</Link>
            </>
          )}
          {user?.role === 'doctor' && (
            <Link to="/doctor">Completed</Link>
          )}
          {user && (
            <button type="button" className={styles.logout} onClick={handleLogout}>
              Log out
            </button>
          )}
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>Remote ED Triage & Telemedicine — CSIS 4495 · Bright Ekeator & AJ Encina</span>
      </footer>
    </div>
  );
}

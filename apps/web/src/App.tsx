import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Layout } from './components/Layout';
import { LoadingState } from './components/LoadingState';
import { RequireAuth, RequirePermission } from './routes/guards';
import { useAuth } from './lib/auth';

const LoginPage = lazy(() => import('./routes/LoginPage'));
const ParticipantDashboardPage = lazy(() => import('./routes/ParticipantDashboardPage'));
const AttendancePage = lazy(() => import('./routes/AttendancePage'));
const LeavesPage = lazy(() => import('./routes/LeavesPage'));
const LeaveDetailPage = lazy(() => import('./routes/LeaveDetailPage'));
const HistoryPage = lazy(() => import('./routes/HistoryPage'));
const AttendanceDetailPage = lazy(() => import('./routes/AttendanceDetailPage'));
const SupervisorDashboardPage = lazy(() => import('./routes/SupervisorDashboardPage'));
const MonitoringPage = lazy(() => import('./routes/MonitoringPage'));
const ApprovalsPage = lazy(() => import('./routes/ApprovalsPage'));
const ReportsPage = lazy(() => import('./routes/ReportsPage'));
const AdminDashboardPage = lazy(() => import('./routes/AdminDashboardPage'));
const MasterDataPage = lazy(() => import('./routes/MasterDataPage'));
const AccessPage = lazy(() => import('./routes/AccessPage'));
const AuditPage = lazy(() => import('./routes/AuditPage'));
const HelpCenterPage = lazy(() =>
  import('./routes/HelpCenterPage').then((m) => ({ default: m.HelpCenterPage })),
);
const HelpArticlePage = lazy(() =>
  import('./routes/HelpCenterPage').then((m) => ({ default: m.HelpArticlePage })),
);
const HelpAdminPage = lazy(() => import('./routes/HelpAdminPage'));
const ProfilePage = lazy(() => import('./routes/ProfilePage'));
const NotFoundPage = lazy(() => import('./routes/NotFoundPage'));

/** '/' renders the dashboard appropriate for the signed-in user's permissions. */
function HomeDashboard() {
  const { has } = useAuth();
  if (has('attendance:submit')) return <ParticipantDashboardPage />;
  if (has('admin:users:manage') || has('leave:approve') || has('attendance:correct')) {
    return <AdminDashboardPage />;
  }
  if (has('access:roles:manage') || has('admin:audit:view')) return <AdminDashboardPage />;
  if (has('attendance:view:scoped') || has('report:view')) return <SupervisorDashboardPage />;
  return <ParticipantDashboardPage />;
}

function PageFallback() {
  return <LoadingState label="Memuat halaman…" />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomeDashboard />} />
          <Route
            path="/absensi"
            element={
              <RequirePermission anyOf="attendance:submit">
                <AttendancePage />
              </RequirePermission>
            }
          />
          <Route
            path="/izin"
            element={
              <RequirePermission anyOf={['leave:request', 'leave:approve', 'leave:view:scoped']}>
                <LeavesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/izin/:leaveId"
            element={
              <RequirePermission anyOf={['leave:request', 'leave:approve', 'leave:view:scoped']}>
                <LeaveDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/riwayat"
            element={
              <RequirePermission anyOf={['attendance:view:own', 'attendance:submit']}>
                <HistoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/riwayat/:attendanceId"
            element={
              <RequirePermission anyOf={['attendance:view:own', 'attendance:submit']}>
                <Suspense fallback={<PageFallback />}>
                  <AttendanceDetailPage mode="own" />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="/monitoring"
            element={
              <RequirePermission anyOf={['attendance:view:scoped', 'report:view']}>
                <MonitoringPage />
              </RequirePermission>
            }
          />
          <Route
            path="/monitoring/:attendanceId"
            element={
              <RequirePermission anyOf={['attendance:view:scoped', 'report:view']}>
                <AttendanceDetailPage mode="monitoring" />
              </RequirePermission>
            }
          />
          <Route
            path="/approval"
            element={
              <RequirePermission anyOf="leave:approve">
                <ApprovalsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/reports"
            element={
              <RequirePermission anyOf="report:view">
                <ReportsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/master"
            element={
              <RequirePermission
                anyOf={[
                  'admin:users:manage',
                  'admin:org:manage',
                  'admin:placements:manage',
                  'admin:assignments:manage',
                  'admin:schedules:manage',
                  'admin:calendar:manage',
                  'admin:leave-categories:manage',
                  'admin:params:manage',
                  'access:roles:manage',
                  'access:scopes:manage',
                ]}
              >
                <MasterDataPage />
              </RequirePermission>
            }
          />
          <Route
            path="/access"
            element={
              <RequirePermission
                anyOf={[
                  'access:roles:manage',
                  'access:permissions:view',
                  'access:feature-tree:manage',
                  'access:policies:manage',
                  'access:scopes:manage',
                  'access:simulate',
                ]}
              >
                <AccessPage />
              </RequirePermission>
            }
          />
          <Route
            path="/audit"
            element={
              <RequirePermission anyOf="admin:audit:view">
                <AuditPage />
              </RequirePermission>
            }
          />
          <Route path="/bantuan" element={<HelpCenterPage />} />
          <Route path="/bantuan/:slug" element={<HelpArticlePage />} />
          <Route
            path="/bantuan-admin"
            element={
              <RequirePermission anyOf="admin:help:manage">
                <HelpAdminPage />
              </RequirePermission>
            }
          />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </MotionConfig>
  );
}

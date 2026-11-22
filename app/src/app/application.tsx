import { NotificationProvider } from '../shared/feedback/notification-provider';
import { WorkspaceProvider, useWorkspace } from '../features/workspaces/workspace-provider';
import { WorkspaceBoundary } from '../features/workspaces/workspace-boundary';
import { WorkspacesPage } from '../features/workspaces/workspaces-page';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-provider';
import { LandingPage } from '../features/auth/landing-page';
import { authReturnError } from '../features/auth/auth-return';
import { AuthPage } from '../features/auth/auth-page';
import { Loading, StartupScreen } from '../shared/ui/primitives';
import { AppShell } from './app-shell';
const AnalyticsPage = lazy(() =>
  import('../features/dashboard/analytics-page').then((m) => ({ default: m.AnalyticsPage })),
);
const DashboardPage = lazy(() =>
  import('../features/dashboard/dashboard-page').then((module) => ({
    default: module.DashboardPage,
  })),
);
const AccountsPage = lazy(() =>
  import('../features/accounts/accounts-page').then((module) => ({ default: module.AccountsPage })),
);
const TransactionsPage = lazy(() =>
  import('../features/transactions/transactions-page').then((module) => ({
    default: module.TransactionsPage,
  })),
);
const ImportsPage = lazy(() =>
  import('../features/imports/imports-page').then((module) => ({ default: module.ImportsPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/settings-page').then((module) => ({ default: module.SettingsPage })),
);
const PlanningPage = lazy(() =>
  import('../features/planning/planning-page').then((module) => ({ default: module.PlanningPage })),
);
const CategoriesPage = lazy(() =>
  import('../features/categories/categories-page').then((module) => ({
    default: module.CategoriesPage,
  })),
);
const CounterpartiesPage = lazy(() =>
  import('../features/counterparties/counterparties-page').then((module) => ({
    default: module.CounterpartiesPage,
  })),
);
const CardsPage = lazy(() =>
  import('../features/cards/cards-page').then((m) => ({ default: m.CardsPage })),
);
const RecognitionPage = lazy(() =>
  import('../features/recognition/recognition-page').then((m) => ({ default: m.RecognitionPage })),
);
const GoalsPage = lazy(() =>
  import('../features/goals/goals-page').then((m) => ({ default: m.GoalsPage })),
);
const WealthPage = lazy(() =>
  import('../features/wealth/wealth-page').then((m) => ({ default: m.WealthPage })),
);
export function Application() {
  const location = useLocation();
  const { session, loading } = useAuth();
  const [initialReady, setInitialReady] = useState(false);
  const [booted, setBooted] = useState(false);
  const [intro, setIntro] = useState(() => {
    try {
      return (
        sessionStorage.getItem('plannedwallet:entered') !== 'yes' &&
        window.matchMedia('(max-width: 767px) and (prefers-reduced-motion: no-preference)').matches
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(timer);
  }, [intro]);

  const bootReady = !loading && initialReady && !intro;
  useEffect(() => {
    if (!bootReady) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
    const timer = window.setTimeout(() => setBooted(true), duration);
    return () => window.clearTimeout(timer);
  }, [bootReady]);

  return (
    <>
      {!booted && <StartupScreen intro={intro} ready={bootReady} />}
      {!loading && (
        <NotificationProvider key={session?.user.id ?? 'guest'}>
          <a className="skip-link" href="#main-content">
            Pular para o conteúdo
          </a>
          <WorkspaceSession initialReady={initialReady}>
            <Suspense fallback={initialReady ? <Loading /> : null}>
              <StartupReady onReady={setInitialReady} />
              <Routes>
                <Route path="/reset-password" element={<AuthPage />} />
                {!session ? (
                  <>
                    <Route
                      index
                      element={
                        authReturnError(location.search, location.hash) ? (
                          <AuthPage />
                        ) : (
                          <LandingPage />
                        )
                      }
                    />
                    <Route path="login" element={<AuthPage />} />
                    <Route path="painel" element={<AuthPage />} />
                    <Route path="*" element={<AuthPage />} />
                  </>
                ) : (
                  <>
                    <Route path="workspaces" element={<WorkspacesPage />} />
                    <Route element={<WorkspaceBoundary />}>
                      <Route element={<AppShell />}>
                        <Route index element={<DashboardPage />} />
                        <Route path="analytics" element={<AnalyticsPage />} />
                        <Route path="accounts" element={<AccountsPage />} />
                        <Route path="accounts/:accountId" element={<TransactionsPage />} />
                        <Route path="transactions" element={<TransactionsPage />} />
                        <Route path="planning" element={<PlanningPage />} />
                        <Route path="cards" element={<CardsPage />} />
                        <Route path="wealth" element={<WealthPage />} />
                        <Route path="goals" element={<GoalsPage />} />
                        <Route path="recognition" element={<RecognitionPage />} />
                        <Route path="imports" element={<ImportsPage key="upload" />} />
                        <Route path="imports/:importId" element={<ImportsPage key="review" />} />
                        <Route path="categories" element={<CategoriesPage />} />
                        <Route path="counterparties" element={<CounterpartiesPage />} />
                        <Route
                          path="settings/categories"
                          element={<Navigate to="/categories" replace />}
                        />
                        <Route path="settings/*" element={<SettingsPage />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </>
                )}
              </Routes>
            </Suspense>
          </WorkspaceSession>
        </NotificationProvider>
      )}
    </>
  );
}

function StartupReady({ onReady }: { onReady: (ready: boolean) => void }) {
  useEffect(() => onReady(true), [onReady]);
  return null;
}

function WorkspaceSession({
  children,
  initialReady,
}: {
  children: ReactNode;
  initialReady: boolean;
}) {
  const { session } = useAuth();
  return session ? (
    <WorkspaceProvider key={session.user.id}>
      <WorkspaceStartup initialReady={initialReady}>{children}</WorkspaceStartup>
    </WorkspaceProvider>
  ) : (
    children
  );
}

function WorkspaceStartup({
  children,
  initialReady,
}: {
  children: ReactNode;
  initialReady: boolean;
}) {
  const { loading } = useWorkspace();
  if (loading && !initialReady) return null;
  return children;
}

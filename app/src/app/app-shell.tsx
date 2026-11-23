import {
  FinancialVisibilityProvider,
  useFinancialVisibility,
} from '../shared/privacy/financial-visibility';
import { createPortal } from 'react-dom';
import { productName } from '../shared/brand';
import { NotificationCenter } from '../shared/feedback/notification-center';
import { useNotifications } from '../shared/feedback/notification-provider';
import { Select } from '../shared/ui/controls/select';
import { CreateWorkspaceForm } from '../features/workspaces/components/create-workspace-form';
import { useWorkspace } from '../features/workspaces/workspace-provider';
import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  ChartNoAxesCombined,
  UsersRound,
  CalendarDays,
  FolderTree,
  ArrowDownUp,
  ArrowUpRight,
  ChevronRight,
  House,
  Landmark,
  Settings,
  Ellipsis,
  Upload,
  WifiOff,
  Eye,
  EyeOff,
  Target,
  ScanSearch,
} from 'lucide-react';
import { useAuth } from '../features/auth/auth-provider';
import { Loading, Logo, Modal } from '../shared/ui/primitives';
import { BrandSymbol } from '../shared/ui/brand-symbol';
const navigation = [
  { to: '/', label: 'Visão geral', mobile: 'Início', Icon: House },
  { to: '/planning', label: 'Planejamento', mobile: 'Planejar', Icon: CalendarDays },
  { to: '/cards', label: 'Cartões e faturas', mobile: 'Cartões', Icon: CreditCard },
  { to: '/transactions', label: 'Movimentações', mobile: 'Extrato', Icon: ArrowDownUp },
  { to: '/accounts', label: 'Contas', mobile: 'Contas', Icon: Landmark },
  { to: '/analytics', label: 'Métricas', mobile: 'Métricas', Icon: ChartNoAxesCombined },
  {
    to: '/wealth',
    label: 'Investimentos e patrimônio',
    mobile: 'Patrimônio',
    Icon: ChartNoAxesCombined,
  },
  { to: '/recognition', label: 'Revisão assistida', mobile: 'Revisão', Icon: ScanSearch },
  { to: '/goals', label: 'Metas e reservas', mobile: 'Metas', Icon: Target },
  { to: '/imports', label: 'Importações', mobile: 'Importações', Icon: Upload },
  { to: '/categories', label: 'Grupos e categorias', mobile: 'Categorias', Icon: FolderTree },
  {
    to: '/counterparties',
    label: 'Pessoas e estabelecimentos',
    mobile: 'Pessoas',
    Icon: UsersRound,
  },
  { to: '/settings', label: 'Ajustes', mobile: 'Ajustes', Icon: Settings },
  { to: '/workspaces', label: 'Gerenciar espaços', mobile: 'Espaços', Icon: FolderTree },
];
const primaryPaths = ['/', '/planning', '/cards', '/transactions', '/imports'];
export function AppShell() {
  return (
    <FinancialVisibilityProvider>
      <ShellContent />
    </FinancialVisibilityProvider>
  );
}
function ShellContent() {
  const { visible, toggle } = useFinancialVisibility();
  const { session } = useAuth();
  const notices = useNotifications();
  const wasOnline = useRef(navigator.onLine);
  const { active, workspaces, select } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const home = location.pathname === '/';
  const firstName =
    String(
      session?.user.user_metadata?.full_name ??
        session?.user.email?.split('@')[0]?.split(/[._-]/)[0] ??
        'você',
    )
      .trim()
      .split(/\s+/)[0] || 'você';
  const currentNav = [...navigation]
    .filter((item) => location.pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const mobileTitle = home
    ? `Olá, ${firstName}`
    : location.pathname.startsWith('/planning')
      ? 'Planejamento'
      : location.pathname.startsWith('/cards')
        ? 'Cartões'
        : location.pathname.startsWith('/transactions')
          ? 'Extrato'
          : (currentNav?.mobile ?? 'PlannedWallet');
  const [arriving, setArriving] = useState(() => {
    try {
      return sessionStorage.getItem('plannedwallet:entered') !== 'yes';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('plannedwallet:entered', 'yes');
    } catch {
      /* Storage is optional. */
    }
  }, []);
  const [more, setMore] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (disposed) return;
        const showWaiting = () => {
          if (!disposed && reg.waiting && navigator.serviceWorker.controller)
            setUpdate(reg.waiting);
        };
        const watchInstall = () => reg.installing?.addEventListener('statechange', showWaiting);
        const check = () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        };
        showWaiting();
        watchInstall();
        reg.addEventListener('updatefound', watchInstall);
        document.addEventListener('visibilitychange', check);
        cleanup = () => {
          reg.removeEventListener('updatefound', watchInstall);
          document.removeEventListener('visibilitychange', check);
        };
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    if (!online)
      notices.warning(
        'Você está sem conexão. As alterações ficam indisponíveis até a internet voltar.',
        { id: 'connection', title: 'Sem conexão' },
      );
    else {
      notices.dismiss('connection');
      if (!wasOnline.current) notices.success('Conexão restabelecida. Você pode continuar.');
    }
    wasOnline.current = online;
  }, [online, notices.warning, notices.success, notices.dismiss]);
  useEffect(() => {
    if (!update) return;
    notices.info('Salve seus formulários antes de atualizar o aplicativo.', {
      id: 'app-update',
      title: 'Nova versão disponível',
      duration: 0,
      action: {
        label: 'Atualizar agora',
        run: () => {
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => window.location.reload(),
            { once: true },
          );
          update.postMessage('ACTIVATE_UPDATE');
        },
      },
    });
  }, [update, notices.info]);
  const name =
    session?.user.user_metadata?.full_name?.split(' ')[0] ??
    session?.user.email?.split('@')[0] ??
    'Você';
  const workspaceSwitcher = (
    <div className="workspace-switcher">
      <span className="space-menu-avatar" aria-hidden="true">
        {active?.name.slice(0, 1).toLocaleUpperCase() ?? '·'}
      </span>
      <Select
        aria-label="Espaço ativo"
        aria-description={active?.name}
        value={active?.id ?? ''}
        onChange={(event) => {
          if (event.target.value === 'new-workspace') {
            setCreatingWorkspace(true);
            return;
          }
          if (event.target.value === active?.id) return;
          select(event.target.value);
          navigate('/');
        }}
      >
        {!active && (
          <option value="" disabled>
            Escolher espaço
          </option>
        )}
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
        <option value="new-workspace" disabled={!online}>
          + Novo espaço
        </option>
      </Select>
    </div>
  );
  return (
    <div
      className={`app-shell premium-app${arriving ? ' app-entry' : ''}`}
      data-page={location.pathname}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'app-arrive')
          setArriving(false);
      }}
    >
      <aside className="desktop-sidebar" aria-label="Menu lateral">
        <NavLink to="/" className="sidebar-brand" aria-label={`${productName} — início`}>
          <Logo />
        </NavLink>
        {workspaceSwitcher}
        <nav aria-label="Navegação principal">
          {[
            { title: 'Principal', paths: [...primaryPaths, '/accounts'] },
            {
              title: 'Patrimônio e organização',
              paths: [
                '/wealth',
                '/analytics',
                '/goals',
                '/categories',
                '/counterparties',
                '/recognition',
              ],
            },
            { title: 'Sistema', paths: ['/settings', '/workspaces'] },
          ].map(({ title, paths }) => (
            <section key={title}>
              <h2>{title}</h2>
              {paths.map((path) => {
                const { to, label, mobile, Icon } = navigation.find((item) => item.to === path)!;
                return (
                  <NavLink key={to} to={to} end={to === '/'} aria-label={label}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{to === '/transactions' ? 'Extrato' : mobile}</span>
                  </NavLink>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <NavLink to="/" className="header-brand" aria-label={`${productName} — início`}>
            <Logo />
          </NavLink>
          <div className={home ? 'mobile-header-title home-header-title' : 'mobile-header-title'}>
            <NavLink to="/" className="mobile-header-mark" aria-label="PlannedWallet — início">
              <BrandSymbol />
            </NavLink>
            {home ? (
              <h1 aria-label="Visão geral">{mobileTitle}</h1>
            ) : (
              <strong>{mobileTitle}</strong>
            )}
          </div>
          <div className="header-actions">
            {home && (
              <NavLink to="/analytics" className="home-header-overview">
                Seu dinheiro, em perspectiva <ArrowUpRight size={15} aria-hidden="true" />
              </NavLink>
            )}
            <button
              className="icon-button visibility-button"
              aria-label={visible ? 'Ocultar valores' : 'Mostrar valores'}
              aria-pressed={!visible}
              onClick={toggle}
            >
              {visible ? <Eye size={19} /> : <EyeOff size={19} />}
            </button>
            <span className="header-notifications">
              <NotificationCenter />
            </span>
            {!online && (
              <span className="connection-chip" aria-label="Sem conexão">
                <WifiOff size={16} />
              </span>
            )}
            {workspaceSwitcher}
          </div>
        </header>
        <main id="main-content" className="page-content">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {createPortal(
        <nav className="bottom-nav" aria-label="Navegação móvel">
          {[
            { to: '/', label: 'Início', Icon: House },
            { to: '/planning', label: 'Planejar', Icon: CalendarDays },
            { to: '/cards', label: 'Cartões', Icon: CreditCard },
            { to: '/transactions', label: 'Extrato', Icon: ArrowDownUp },
            { to: '/imports', label: 'Importar', Icon: Upload },
          ].map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={(event) => {
              menuTrigger.current = event.currentTarget;
              setMore(true);
            }}
            aria-label="Abrir mais funções"
          >
            <Ellipsis size={21} strokeWidth={1.7} aria-hidden="true" />
            <span>Mais</span>
          </button>
        </nav>,
        document.body,
      )}
      <Modal open={creatingWorkspace} onOpenChange={setCreatingWorkspace} title="Um novo espaço">
        {creatingWorkspace && <CreateWorkspaceForm onCreated={() => setCreatingWorkspace(false)} />}
      </Modal>
      <Modal
        open={more}
        onOpenChange={setMore}
        title="Menu do espaço"
        description="Acesse as áreas e gerencie seus espaços."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          menuTrigger.current?.focus();
        }}
      >
        <nav className="more-menu" aria-label="Mais funções">
          {[
            {
              title: 'Seu dinheiro',
              paths: ['/accounts', '/planning', '/cards', '/wealth'],
            },
            {
              title: 'Organização',
              paths: ['/goals', '/recognition', '/categories', '/counterparties', '/analytics'],
            },
            { title: 'Sistema', paths: ['/settings'] },
          ].map((group) => (
            <div className="more-menu-group" key={group.title}>
              <h3>{group.title}</h3>
              {navigation
                .filter((n) => group.paths.includes(n.to))
                .map(({ to, label, Icon }) => (
                  <NavLink
                    to={to}
                    key={to}
                    className={
                      primaryPaths.includes(to) || to === '/cards'
                        ? 'menu-mobile-destination'
                        : undefined
                    }
                    onClick={() => setMore(false)}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                    <ChevronRight size={16} />
                  </NavLink>
                ))}
            </div>
          ))}
          <NavLink to="/workspaces" onClick={() => setMore(false)}>
            <FolderTree size={21} />
            <span>Trocar de espaço</span>
            <ChevronRight size={17} />
          </NavLink>
        </nav>
        <div className="menu-profile">
          <strong>{name}</strong>
          <span>{session?.user.email}</span>
        </div>
      </Modal>
    </div>
  );
}

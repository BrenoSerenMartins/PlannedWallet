import {
  FinancialVisibilityProvider,
  useFinancialVisibility,
} from '../shared/privacy/financial-visibility';
import { createPortal } from 'react-dom';
import { ActionMenu } from '../shared/ui/action-menu';
import { Tooltip } from '../shared/ui/tooltip';
import { productName } from '../shared/brand';
import { NotificationCenter } from '../shared/feedback/notification-center';
import { useNotifications } from '../shared/feedback/notification-provider';
import { useWorkspace } from '../features/workspaces/workspace-provider';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CreditCard,
  ChartNoAxesCombined,
  UsersRound,
  CalendarDays,
  FolderTree,
  ArrowDownUp,
  ChevronRight,
  ChevronDown,
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
import { Logo, Modal } from '../shared/ui/primitives';
import { BrandSymbol } from '../shared/ui/brand-symbol';
const navigation = [
  { to: '/', label: 'Visão geral', mobile: 'Início', Icon: House },
  { to: '/planning', label: 'Planejamento', mobile: 'Planejar', Icon: CalendarDays },
  { to: '/cards', label: 'Cartões e faturas', mobile: 'Cartões', Icon: CreditCard },
  { to: '/transactions', label: 'Movimentações', mobile: 'Movimentos', Icon: ArrowDownUp },
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
  { to: '/settings', label: 'Preferências', mobile: 'Ajustes', Icon: Settings },
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
  const { active } = useWorkspace();
  const location = useLocation();
  const firstName =
    session?.user.user_metadata?.full_name?.split(' ')[0] ??
    session?.user.email?.split('@')[0] ??
    'Você';
  const currentNav = [...navigation]
    .filter((item) => location.pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const mobileTitle =
    location.pathname === '/'
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
  return (
    <div
      className={`app-shell premium-app${arriving ? ' app-entry' : ''}`}
      data-page={location.pathname}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'app-arrive')
          setArriving(false);
      }}
    >
      <div className="app-main">
        <header className="app-header">
          <NavLink to="/" className="header-brand" aria-label={`${productName} — início`}>
            <Logo />
          </NavLink>
          <div className="mobile-header-title">
            <NavLink to="/" className="mobile-header-mark" aria-label="PlannedWallet — início">
              <BrandSymbol />
            </NavLink>
            <strong>{mobileTitle}</strong>
          </div>
          <nav className="desktop-navigation" aria-label="Navegação principal">
            {navigation
              .filter((n) => primaryPaths.includes(n.to))
              .map(({ to, label, Icon }) => {
                const title = to === '/wealth' ? 'Patrimônio' : label;
                if (to === '/accounts')
                  return (
                    <ActionMenu
                      key={to}
                      label="Contas"
                      active={
                        location.pathname.startsWith('/accounts') ||
                        location.pathname.startsWith('/cards')
                      }
                      trigger={
                        <>
                          <Icon size={17} aria-hidden="true" />
                          <span>Contas</span>
                          <ChevronDown size={12} aria-hidden="true" />
                        </>
                      }
                    >
                      <NavLink to="/accounts">Contas e saldos</NavLink>
                      <NavLink to="/cards">Cartões e faturas</NavLink>
                    </ActionMenu>
                  );

                return (
                  <Tooltip key={to} text={title}>
                    <NavLink to={to} end={to === '/'} aria-label={title}>
                      <Icon size={17} strokeWidth={1.65} aria-hidden="true" />
                      <span>{title}</span>
                    </NavLink>
                  </Tooltip>
                );
              })}
          </nav>
          <div className="header-actions">
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
            <Tooltip text="Preferências">
              <NavLink
                to="/settings"
                className="icon-button header-settings"
                aria-label="Preferências"
              >
                <Settings size={19} aria-hidden="true" />
              </NavLink>
            </Tooltip>
            {!online && (
              <span className="connection-chip" aria-label="Sem conexão">
                <WifiOff size={16} />
              </span>
            )}
            <button
              type="button"
              className={`header-more header-space-menu ${navigation.filter((n) => !primaryPaths.includes(n.to) && n.to !== '/settings').some((n) => location.pathname.startsWith(n.to)) ? 'active' : ''}`}
              onClick={(event) => {
                menuTrigger.current = event.currentTarget;
                setMore(true);
              }}
              aria-haspopup="dialog"
              aria-label={`Menu do espaço: ${active?.name ?? 'Seu espaço'}`}
            >
              <span className="space-menu-avatar" aria-hidden="true">
                {active?.name.slice(0, 1).toLocaleUpperCase() ?? '·'}
              </span>
              <span>{active?.name ?? 'Seu espaço'}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <main id="main-content" className="page-content">
          <Outlet />
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
          <button type="button" onClick={() => setMore(true)} aria-label="Abrir mais funções">
            <Ellipsis size={21} strokeWidth={1.7} aria-hidden="true" />
            <span>Mais</span>
          </button>
        </nav>,
        document.body,
      )}
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
              paths: ['/goals', '/recognition', '/categories', '/counterparties'],
            },
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

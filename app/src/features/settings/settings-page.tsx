import { PageHeader } from '../../shared/ui/page-header';
import { useState } from 'react';
import {
  deviceNotificationsEnabled,
  setDeviceNotifications,
  supportsDeviceNotifications,
} from '../../shared/feedback/device-notifications';
import { ViewSwitcher } from '../../shared/ui/view-switcher';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/auth-provider';
import { authClient } from '../../shared/api/auth-client';
import { Button, ThemeSwitcher } from '../../shared/ui/primitives';
import { DataSettings } from './data-settings';
export function SettingsPage() {
  const { session } = useAuth();
  const [deviceNotices, setDeviceNotices] = useState(deviceNotificationsEnabled);
  const [noticeStatus, setNoticeStatus] = useState('');
  const [params, setParams] = useSearchParams();
  const view = ['appearance', 'data', 'account'].includes(params.get('view') ?? '')
    ? params.get('view')!
    : 'appearance';
  const setView = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'appearance') next.delete('view');
    else next.set('view', value);
    setParams(next);
  };

  return (
    <div className="page-enter settings-page">
      <PageHeader route title="Ajustes" />
      <ViewSwitcher
        label="Seções de ajustes"
        value={view}
        onChange={setView}
        options={[
          { value: 'account', label: 'Conta' },
          { value: 'data', label: 'Dados' },
          { value: 'appearance', label: 'Aparência' },
        ]}
      />
      <div className="view-content">
        {view === 'appearance' && (
          <>
            <section className="panel settings-panel">
              <h2 className="sr-only">Aparência</h2>
              <div className="settings-info">
                <ThemeSwitcher expanded />
                <p>
                  O modo sistema acompanha seu dispositivo. Sua escolha fica salva neste navegador.
                </p>
              </div>
            </section>
            {supportsDeviceNotifications() && (
              <section className="panel settings-panel">
                <h2>Notificações do dispositivo</h2>
                <p>Avisos de faturas importadas quando o app estiver em segundo plano.</p>
                <Button
                  className="secondary"
                  aria-pressed={deviceNotices}
                  onClick={async () => {
                    try {
                      const enabled = await setDeviceNotifications(!deviceNotices);
                      setDeviceNotices(enabled);
                      setNoticeStatus(
                        !deviceNotices && !enabled
                          ? 'Autorize as notificações nas configurações do navegador.'
                          : '',
                      );
                    } catch {
                      setNoticeStatus(
                        'Não foi possível alterar as notificações neste dispositivo.',
                      );
                    }
                  }}
                >
                  {deviceNotices
                    ? 'Desativar avisos neste dispositivo'
                    : 'Ativar avisos neste dispositivo'}
                </Button>
                {noticeStatus && <p role="status">{noticeStatus}</p>}
              </section>
            )}
          </>
        )}
        {view === 'data' && <DataSettings />}
        {view === 'account' && (
          <section className="panel settings-panel">
            <div className="section-heading">
              <div>
                <h2>
                  <ShieldCheck size={18} />
                  Sua conta
                </h2>
                <p>{session?.user.email}</p>
              </div>
            </div>
            <div className="settings-info">
              <Button className="secondary" onClick={() => void authClient.auth.signOut()}>
                Sair da conta
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

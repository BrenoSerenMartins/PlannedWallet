const preferenceKey = 'plannedwallet:device-notifications';

export function supportsDeviceNotifications() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function deviceNotificationsEnabled() {
  try {
    return (
      supportsDeviceNotifications() &&
      Notification.permission === 'granted' &&
      localStorage.getItem(preferenceKey) === 'enabled'
    );
  } catch {
    return false;
  }
}

export async function setDeviceNotifications(enabled: boolean) {
  if (!enabled) {
    localStorage.removeItem(preferenceKey);
    return false;
  }
  if ((await Notification.requestPermission()) !== 'granted') return false;
  localStorage.setItem(preferenceKey, 'enabled');
  return true;
}

export async function notifyDevice() {
  try {
    if (!document.hidden || !deviceNotificationsEnabled()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.showNotification('PlannedWallet', {
      body: 'Uma fatura foi importada. Abra o app para conferir.',
      icon: '/icon-192.png?v=4',
      tag: 'invoice-imported',
    });
  } catch {
    // The in-app notification remains available when the platform cannot display a banner.
  }
}

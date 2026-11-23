# Notifications and contextual help

## Product behaviour
Transient action acknowledgements use floating popups instead of permanent success banners. Account/transaction/category saves, planning changes, card and wealth operations, workspace deletion/restoration, reprocessing and import confirmation publish their results through the shared notification provider. Connection loss/recovery and app updates use the same system. A small offline header indicator remains because it explains why write controls are unavailable.

The bell opens the latest 40 session notices. The app shows one banner at a time, sliding down from the top, with reduced-motion support. Routine informational messages go directly to history. Success, warning, error and actionable notices are eligible for a banner. Hover, keyboard focus and a background tab pause the display timer. Opening history marks notices read and dismisses their floating copies.

In Settings → Appearance, users can opt into device notifications on compatible browsers. Individual invoice confirmations can trigger a native banner when the app is running in the background. The banner contains no transaction details or values. This uses the active service worker and browser permission. Delivery with the app closed would require a server-side Web Push subscription and sender.

Notification history clears on a workspace change or identity change. Workspace-scoped callbacks capture a generation: a request finishing after a space switch cannot publish into the new space. Workspace-management/authentication acknowledgements explicitly use the session scope. No source financial data is changed by feedback delivery.

## What stays contextual
Field validation remains in its form. Loading failures keep their retry action beside the unavailable content. Duplicate exclusions, balance conflicts and other decisions that affect confirmation remain visible near the relevant records. Generic explanations can be reduced to a short coverage label plus explicit help; essential facts are not hidden behind hover.

## Tooltip contract
`Tooltip` decorates an existing native control without a layout wrapper, preserving its label, ref and event handlers. Icon actions remain one-tap actions. Hover and keyboard focus provide short descriptions; `HelpTip` provides an explicit tap/keyboard toggle for financial concepts. Text is also linked with `aria-describedby`. Popups clamp to the viewport and choose above/below placement, dismiss on outside interaction/Escape, and stay readable while hovered. Escape dismisses an open tooltip before dismissing a dialog.

Use help for available money versus monthly result, planning scope and benefit month, investment/net-worth boundaries, invoice credits and compact icon actions. Keep primary labels and important constraints visible. Do not nest help buttons inside links or implicit form labels.

## Verification
Browser regressions cover floating feedback without layout shift, manual dismissal/history recovery, timeout pause, workspace isolation including a late request, keyboard/Escape handling and touch help with single-tap actions. Playwright discovers 105 scenarios; execution remains blocked by this environment's local server/Chromium permissions. Domain/database verification passes 206 tests in 30 suites. Final code checks are recorded alongside the implementation; browser discovery is not a browser pass.

Implementation checks: lint is clean, type checking and production builds pass, and the frontend credential scan passes. Mounted live regions provide separate polite/assertive announcements without repeating the visual toast content. Tooltip integration adds no package dependency. This change requires no database migration.

### Alertas de orçamento

O orçamento mensal da categoria é o limite. O alerta de limite começa ligado. O aviso antecipado começa desligado e, quando ativado, usa uma margem configurável (20% por padrão). As duas opções são independentes. Uma despesa que já alcança o limite gera apenas o aviso de limite, e cada faixa usa um identificador por categoria e mês.

O PWA pode enviar o aviso ao sistema do celular quando sincroniza a central e as notificações do dispositivo estão autorizadas. A mensagem nativa omite valores e categorias. Tocar nela abre o Planejamento. A sincronização depende do app em execução. O servidor não envia Web Push com o app fechado.

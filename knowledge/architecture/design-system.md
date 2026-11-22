# Design system

## Purpose and direction

Current visual direction (2026-11-21): Black & Gold, Dark Soft UI and an asymmetric Bento grid. Use obsidian surfaces, restrained metallic gold, soft depth and a 1px inset top highlight. The current implementation in `app/src/app/styles/premium.css` and `features/dashboard/bento-dashboard.css` supersedes the older palette/navigation notes below. Preserve financial semantics, API contracts and existing feature routes. The product manages finances; labels must not imply that PlannedWallet holds money or executes bank payments.

## Themes and tokens

Support `light`, `dark`, and `system`. Default to dark and persist an explicit override locally; an existing light or system choice remains respected. Apply the resolved theme before first paint, update the browser theme color, and respond to system changes only in system mode. Theme initialization must work with the production Content Security Policy.

| Semantic token | Dark      | Light     |
| -------------- | --------- | --------- |
| Background     | `#09090B` | `#F6F5F1` |
| Surface        | `#121215` | `#FFFEFA` |
| Raised surface | `#1A1A1F` | `#EEEDE8` |
| Text           | `#F4F4F6` | `#24232A` |
| Muted text     | `#8E8E93` | `#67666D` |
| Gold action    | `#D4AF37` | `#8C6B15` |
| Champagne      | `#F3E5AB` | `#795E24` |
| Income         | `#10B981` | `#087F5B` |
| Expense        | `#EF4444` | `#BC3341` |

- Define colors, typography, spacing, radii, elevation, motion, and chart colors as CSS custom properties. Components consume semantic tokens rather than hardcoded theme colors.
- Use a 4px spacing scale; standard surface radii around 16–24px, controls around 10–12px. Reserve pill shapes for badges and compact filters.
- Use locally bundled Inter or a system sans-serif fallback; use tabular numerals for amounts and right-align numeric columns.
- Keep hero balances prominent and supporting numbers quieter. Use a restrained gold-lit gradient on the balance area; avoid translucent treatment over transaction text.
- Income, expense, transfer, warning, and error get separate semantic treatments, with labels/icons as well as color. Validate every implemented state in both themes.
- Initial contrast checks for the specified main text, muted text, and button pairs exceed 4.5:1. This is a palette check, not a completed interface accessibility audit.

## Navigation and layout

- Desktop: compact top navigation for Overview, Metrics, Transactions, Accounts and Planning. Other existing areas remain in the workspace menu; there is no permanent sidebar.
- Mobile: four destinations in a floating glass dock: Início (`/`), Métricas (`/analytics`), Extrato (`/transactions`) and Ajustes (`/settings`). Keep the dock 16px inside the viewport plus safe-area insets, with sufficient content bottom padding. Accounts, Planning, Cards, Wealth, Goals, Recognition and Imports remain available through the header menu and contextual shortcuts.
- Home: real account balance and budget utilization in the gold hero, separate restricted benefits/reserves, five working shortcuts, two monthly KPIs, a cash-flow chart and four recent movements. Use two mobile columns and a 12-column asymmetric desktop grid. Keep account reference audit, monthly composition and forecast reachable through disclosures.
- Metrics: existing monthly comparisons and spending breakdown plus a labeled donut and goal progress. Aggregate excess donut segments into a labeled “Outros grupos”; never invent growth percentages.
- Cash-flow chart: 7D/1M use every paginated ledger entry in the reporting-date range; 6M uses monthly history. The chart represents cumulative income minus expenses, explicitly not the account balance. Transfers are excluded and refunds retain their signs. Support keyboard and pointer selection.
- Privacy: one shared visibility state across authenticated routes. Hide monetary text and financial chart geometry; older supporting views may use blur. Privacy is a screen convenience, not access control.
- Detailed views retain account, period and transaction context and support browser Back. Quick actions open existing entry/transfer/planning/card/goal flows and never claim to perform a Pix or bank payment.

## Screens and flows

| Surface        | Core content and behavior                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | Sign in, sign up, verification feedback, password recovery; clear error and expired-link states                                                         |
| First use      | Create the first supported account; derive balance references from a validated statement or a manual balance confirmation                               |
| Home           | Tracked balances with coverage label, selected-period income/expenses, shortcuts, recent transactions                                                   |
| Accounts       | Institution, account type, recorded balance, statement coverage and transaction history                                                                 |
| Transactions   | Search, period/account/category/type filters; detail, create, edit, and explicit reversal/removal confirmation                                          |
| Import         | Account selection → upload → extraction summary → review/corrections/automatic duplicate exclusion and ambiguous-match decisions → confirmation receipt |
| Import history | Status, counts, reconciliation, and batch reversal with a clear impact preview                                                                          |
| Categories     | Income/expense switcher, searchable expandable groups, category editing/moves and a protected default group                                             |
| Settings       | Appearance, data/backup and account sections in a view switcher                                                                                         |

## Components and interaction

- Shared UI: Button, IconButton, Field, MoneyInput, DateField, Select, Dialog, Sheet, Tabs, Badge, Toast, Skeleton, EmptyState, and ErrorState. Create components when a real screen needs them.
- Shared financial presentation: Amount, TransactionRow, AccountIdentity, and BalanceVisibilityControl once reused. Keep financial calculations outside these components.
- Home sections remain separate components; pages compose sections and feature hooks rather than own rules or networking.
- Use one focused task per form. On mobile, prefer a full-height sheet or page for long entry and import review; preserve unsubmitted values after recoverable errors.
- Provide explicit loading, empty, populated, validation, offline, session-expired, and server-error states. Never show demonstration transactions or placeholder balances as real user data.
- Use 150ms transitions for feedback and surface changes. Respect reduced motion and keep amount readability stable during loading or theme changes.
- Aim for at least 44px touch targets, visible keyboard focus, properly associated labels, accessible dialog focus, announced upload status, and table/text alternatives to charts.
- Amount hiding is a convenience for screen privacy; it is not access control. Clear private screen data and in-memory query caches at sign-out or user changes.

## Financial presentation boundaries

Home reports tracked account balances with coverage, separate benefit/reserve balances and existing registered wealth information. Goals and investments consume their existing feature data. Never fill missing data with fabricated balances or nonfunctional controls. Unknown references retain their warning and drilldown.

## Visual acceptance

Validate at 360px, 390px, 768px, and 1440px; check both themes plus system theme changes, long descriptions, large/negative amounts, keyboard interaction, and reduced motion. No clipped main actions, overlapping bottom navigation, or loss of form state during theme switching.

## Historical interface revisions

The following notes record earlier behavior. Current colors and navigation are defined above; financial rules and interaction requirements remain applicable.

## Information hierarchy update

Import upload/history use separate views. Review separates all/pending/ready/locked duplicates, keeps source reconciliation and consultation-only retention in disclosures, and exposes grouped category selectors. Mobile review uses stacked rows and full-width 44px selects instead of shrinking the desktop table. Counts and labels remain explicit; confirmed duplicates cannot be selected through either UI or API. Transaction lists show group/category context and have type switchers plus expandable account/category/date filters. Planning groups collapse independently without recalculating financial totals in UI. Existing theme tokens and focused keyboard/native disclosure controls remain authoritative. PWA shell version advances to v4.

The category page uses a compact heading, expense/income switcher and search. Groups are accessible keyboard-navigable tabs, with the protected default Geral always first and sticky while horizontally scrolling. The selected group shows one compact category list; search lists matching categories across groups with group context. Group actions and add-category share the list header. Category rows have semantic red/green indicators and a delete action; group tabs alone show custom group colors. Categories have no color picker; group forms retain customization/reset. Existing stored category colors are not rewritten on load; saving a category normalizes its color to its type default.

Import review exposes a focused reprocessing dialog for drafts/history: saved data versus resupplied original, preserved reviews by default and explicit classification reset. State limitations and no-financial-write behavior are visible before execution.

The category section uses negative/positive theme tokens for selected switcher state, group icons, subtle card borders and chip backgrounds. Brand navigation and primary actions retain the emerald identity. Custom group/category colors remain secondary identity dots, including previously saved green expense groups; semantic context does not rewrite saved colors. Expense/income explanatory copy follows the active section.

Planning summary cards show Previsto and Realizado together with a labeled variance. Expense overrun is negative and remaining budget positive; no-target states show no comparison. Contribution actual is explicitly unidentified until tracked. Uncategorized typed actuals are displayed as Outros with an inclusion message; reserve review warnings for unknown financial types rather than suggesting uncategorized money is missing from totals.

## Overview/navigation revision — implemented plan (2026-10-30)

1. Replace the permanent sidebar with compact desktop navigation and retain the five mobile destinations. Preserve workspace, offline/update and dialog behavior.
2. Keep current tracked balances independent of the selected analysis month; provide an expandable account composition, conditional benefit/reserve balances and privacy controls.
3. Group period income, expenses and result with plain explanations; place the month picker within that section.
4. Compare actuals with saved plan targets and show expense groups including uncategorized amounts. Use exact signed ledger aggregation, excluding reversed entries and transfers.
5. Carry month/type into transaction drilldowns, and month into planning. Validate query isolation, aggregate totals, loading/error/empty states, responsive navigation and both themes. No schema change or financial writes.

The overview uses a compact green-tinted balance panel, conditional secondary balances and native account-composition disclosure. Month cards share an equal visual hierarchy with type-semantic colors, actual amount, planned amount and variance. No-target, loading and failed-plan states remain distinct. Expense groups use labeled horizontal bars with exact text amounts (hidden together with all other monetary values); negative group net values from prior-month refunds remain signed rather than clamped. No claims of bank-complete net worth or inferred monthly opening money are made.

Overview comparisons add accessible 2/4/7/12-month and bars/lines switchers. Responsive SVG supports signed values, readable month/year labels, keyboard focus/selection and a detail strip; narrow screens scroll only inside long charts/tables. The text table remains the exact-value alternative. Expense breakdown switches groups/categories and preserves signed refund totals. Monetary privacy hides chart geometry and table values, as well as comparison amounts. Workspace cards expose a separate delete button outside the open-space link; confirmation explains seven-day retention and the trash shows the exact restore deadline with pending/error/success states.

## Current balance and task usability (2026-10-31)

The source/date of current balance is visible outside the collapsed composition, with a normalized-source link. MP closing position and Alelo manual observation have distinct copy. Derived base calculations remain in expandable audit details. Import results separate ledger counts from current-balance/reference changes; existing lost-response protection is preserved.

Shared refinement CSS raises standalone targets to 44px, primary mobile controls to 48px, task labels/body readability and non-obscured focus. Mobile dialogs use full viewport sheets constrained by both dvh and VisualViewport, with contextual save regions; desktop transaction details use a side panel. Import review stacks at tablet/narrow widths, provides separate 48px selection labels and scopes bulk actions to visible editable rows. Workspace appearance moves out of the narrow header. Chart comparison strips and single-balance desktop panels are more compact, axes use rounded intervals, and all financial geometry honors privacy. URL filters and transaction details preserve Back navigation. Chrome visual/keyboard tests passed across nine widths, both themes and emulated text/viewport changes; no claim of native device/Safari or full WCAG certification.

## Shared interface implementation

See [Shared interface system](interface-system.md) for the complete route coverage, shared `PageHeader`, visual ownership and browser verification limits of the November 2026 revision. Main text, muted text and neutral primary-button contrast pairs exceed 4.5:1 in both palettes; this is a palette calculation, not a full accessibility audit.

## Task and content review

The follow-up [navigation and task layout review](navigation-task-review.md) defines each destination’s purpose, primary action, default content and supporting disclosures. Changes to area structure should preserve URL context and filtered empty states rather than adding another permanent block to every page.

## Notifications and help

Use [shared notifications and contextual help](notifications-help.md) for temporary feedback and compact explanations. Action confirmations use floating notices with session history; field validation and decisions affecting a financial operation remain beside their data. Use hover/focus descriptions for icon controls and explicit touch help for financial concepts. Tooltips must preserve the original action and accessible name.

The compact shared header keeps the financial-visibility control at a minimum 44×44px touch target. Header text can truncate before reducing this target; keyboard names and the privacy behavior remain unchanged.

The card wallet retains a compact PageHeader with an accessible level-one heading, even when the visual header is supplied by the shared app shell.

Planning uses one canonical level-one page title; the visible “Visão futura” subtitle is level two with the existing visual styling preserved.

## App opening and loading HUD

The application uses one branded opening across session and workspace initialization. The first mobile opening in a tab gives the mark and wordmark time to appear, then the opening fades into the app. Reduced motion removes the extra hold and animation. Internal route loading retains the app shell.

The shared loading component uses HUD shapes for ledger rows, fields, account balance, planning, cards, summaries and charts. The placeholders reuse semantic surfaces and respect reduced motion. Keep modal descriptions for context the user needs to make a decision.

The Planning hero links to Accounts for balance review. The account-by-account composition remains available from the dashboard's monthly details. In Planning, green bars indicate income progress, gold indicates spending within budget and coral indicates overspending.

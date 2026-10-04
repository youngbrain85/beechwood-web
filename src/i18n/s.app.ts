// ------------------------------------------------------------------
//  UI strings — app shell (App) · sign-in (auth)
//
//  Rules (all s.*.ts files):
//   · display text only; use a function when a value is interpolated: (n) => `${n} items`
//   · labels, buttons and titles in Title Case, sentences in sentence case
//   · the bridge name in the app subtitle comes from the bridge profile texts (bridge/beechwood/texts.ts)
// ------------------------------------------------------------------
import { BRIDGE_NAME as BW_NAME } from '@/bridge/beechwood/texts';

export const SApp = {
  brand: 'JJ InfraData',
  brandSub: `Bridge Visual Inspection — ${BW_NAME}`,
  navOverview: 'Dashboard',
  navModel: '3D View',
  navAnalysis: 'Damage Analysis',
  navDrawings: 'Damage Map',
  navQuantities: 'Damage Quantity',
  navProposals: 'Sheet Proposals',
  /* Waiting text of a lazily loaded route; the same text the other screens use. */
  loading: 'Loading…',
  /* Shown when a lazily loaded route cannot fetch its chunk (a tab left open across a redeploy); RouteErrorBoundary. */
  routeLoadError: 'Could not load this screen — a new version may have been deployed.',
  reload: 'Reload',
  noEmail: '(no email)',
  signOut: 'Sign Out',
} as const;

export const SAuth = {
  errInvalid: 'Incorrect email or password.',
  errNotConfirmed: 'This account has not confirmed its email address.',
  errRateLimit: 'Too many sign-in attempts. Please try again later.',
  errNetwork: 'Network error — please check your connection.',
  errUnknown: (message: string): string => `Sign-in failed (${message})`,
  errRequired: 'Please enter your email and password.',
  email: 'Email',
  password: 'Password',
  signIn: 'Sign In',
  notice: 'Authorized accounts only. For an account, contact your administrator.',
  /* Developer-facing errors (never shown on screen) */
  sessionOutsideGate: 'useSession can only be used under AuthGate',
} as const;

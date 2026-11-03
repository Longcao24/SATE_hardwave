// Interactive guide (2026-11-03): tours that point at the REAL screen, replacing the old 5-slide "Show Guide".
//
// - A tour is a list of steps (tours.tsx). A step names a target on the page — a CSS selector, a [title], or the
//   visible text of a button/heading — and the overlay dims everything else, rings the target and puts the
//   explanation next to it. A step can move to a page by itself, wait for the user to click the target, or wait
//   for a route (e.g. "open any recording").
// - The Guide Center lists the tours. It opens BY ITSELF exactly once — on an account's first sign-in (flag in the
//   account's user_metadata, so it holds across browsers) — and afterwards from "Guidelines" (sidebar / dashboard).
// - The overlay never blocks the page: only the explanation card takes clicks, so the user can do the real thing.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb, MousePointerClick, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/supabase';
import { trackAction } from '@/services/usage/tracker';
import { OPEN_A_REPORT, TOURS, type Tour, type TourStep, type TourTarget } from './tours';
import { GuideChecklist } from './GuideChecklist';

/** Accounts created on/after this day get the onboarding once; older accounts are not first sign-ins. */
const ONBOARDING_SINCE = Date.parse('2026-11-03T00:00:00Z');
const META_KEY = 'sate_onboarding_done';

interface GuideCtx {
  openCenter: () => void;
  startTour: (id: string) => void;
  doneTours: string[];
}
const Ctx = createContext<GuideCtx>({ openCenter: () => {}, startTour: () => {}, doneTours: [] });
export const useGuide = () => useContext(Ctx);

const doneKey = (uid: string) => `sate.guide.done.${uid}`;
const readDone = (uid?: string) => { try { return uid ? JSON.parse(localStorage.getItem(doneKey(uid)) || '[]') as string[] : []; } catch { return []; } };

/** Find a step's target on the page (visible elements only). */
function findTarget(t: TourTarget | TourTarget[] | undefined): HTMLElement | null {
  if (!t) return null;
  if (Array.isArray(t)) { for (const x of t) { const el = findTarget(x); if (el) return el; } return null; }
  const visible = (el: Element | null): el is HTMLElement => {
    if (!el) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  if (typeof t === 'string') return [...document.querySelectorAll(t)].find(visible) as HTMLElement ?? null;
  if ('title' in t) return [...document.querySelectorAll(`[title^=${JSON.stringify(t.title)}]`)].find(visible) as HTMLElement ?? null;
  const root: ParentNode = (t.within && document.querySelector(t.within)) || document;
  const want = t.text.toLowerCase();
  const els = [...root.querySelectorAll('button, a, h1, h2, h3, h4, label, [role="button"], p, span')];
  const hit = els.find((e) => visible(e) && (e.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase() === want)
    ?? els.find((e) => visible(e) && (e.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase().startsWith(want));
  // A label inside a button: ring the button.
  return hit ? ((hit.closest('button, a, [role="button"]') as HTMLElement) || (hit as HTMLElement)) : null;
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [centerOpen, setCenterOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [active, setActive] = useState<{ tour: Tour; i: number } | null>(null);
  const [doneTours, setDoneTours] = useState<string[]>([]);

  useEffect(() => { setDoneTours(readDone(user?.id)); }, [user?.id]);

  // ---- onboarding: once per account, on the first sign-in ----
  const onboardingChecked = useRef<string | null>(null);
  useEffect(() => {
    if (!user || onboardingChecked.current === user.id) return;
    onboardingChecked.current = user.id;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let localSeen = false;
    try { localSeen = !!localStorage.getItem(`sate.onboarding.${user.id}`); } catch { /* private mode */ }
    const created = Date.parse(user.created_at || '');
    if (meta[META_KEY] || localSeen || !(created >= ONBOARDING_SINCE)) return;
    if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/oversight')) return;
    setWelcome(true); setCenterOpen(true);
    trackAction('guide:onboarding-shown');
  }, [user, location.pathname]);

  const markOnboarded = useCallback(() => {
    if (!user) return;
    try { localStorage.setItem(`sate.onboarding.${user.id}`, new Date().toISOString()); } catch { /* private mode */ }
    if (!(user.user_metadata as Record<string, unknown> | undefined)?.[META_KEY]) {
      void supabase.auth.updateUser({ data: { [META_KEY]: new Date().toISOString() } }).then(() => {}, () => {});
    }
  }, [user]);

  const closeCenter = useCallback(() => { setCenterOpen(false); if (welcome) { markOnboarded(); setWelcome(false); } }, [welcome, markOnboarded]);
  const openCenter = useCallback(() => { setWelcome(false); setCenterOpen(true); trackAction('guide:open'); }, []);

  const startTour = useCallback((id: string) => {
    const found = TOURS.find((t) => t.id === id);
    if (!found) return;
    // A report task with no report on screen starts by opening one (the sample, or one of theirs).
    const tour = found.needsReport && !document.querySelector('[data-tour="transcript"]')
      ? { ...found, steps: [OPEN_A_REPORT, ...found.steps] } : found;
    if (welcome) { markOnboarded(); setWelcome(false); }
    setCenterOpen(false);
    setActive({ tour, i: 0 });
    trackAction(`guide:start:${id}`);
  }, [welcome, markOnboarded]);

  const finish = useCallback((completed: boolean) => {
    setActive((a) => {
      if (a && completed && user) {
        const next = [...new Set([...readDone(user.id), a.tour.id])];
        try { localStorage.setItem(doneKey(user.id), JSON.stringify(next)); } catch { /* private mode */ }
        setDoneTours(next);
        trackAction(`guide:finish:${a.tour.id}`);
      }
      return null;
    });
    setCenterOpen(true);
  }, [user]);

  const value = useMemo(() => ({ openCenter, startTour, doneTours }), [openCenter, startTour, doneTours]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {centerOpen && !active && <GuideChecklist welcome={welcome} doneTours={doneTours} onStart={startTour} onClose={closeCenter} />}
      {active && (
        <TourOverlay key={`${active.tour.id}:${active.i}`} tour={active.tour} index={active.i}
          pathname={location.pathname} navigate={navigate}
          onIndex={(i) => setActive((a) => (a ? { ...a, i } : a))}
          onFinish={finish} />
      )}
    </Ctx.Provider>
  );
}

const CARD_W = 340;

function TourOverlay({ tour, index, pathname, navigate, onIndex, onFinish }: {
  tour: Tour; index: number; pathname: string; navigate: (to: string) => void;
  onIndex: (i: number) => void; onFinish: (completed: boolean) => void;
}) {
  const step: TourStep = tour.steps[index];
  const last = index === tour.steps.length - 1;
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [searching, setSearching] = useState(!!step.target);
  const next = useCallback(() => (last ? onFinish(true) : onIndex(index + 1)), [last, index, onIndex, onFinish]);
  const back = () => { if (index > 0) onIndex(index - 1); };

  // Already done when the step starts (e.g. "open a report" while a report is open): move on at once, and do NOT
  // navigate — going to the step's page first is what made the tour jump to the Dashboard and then show
  // "This is a report" there (2026-11-03).
  const doneAtStart = useRef(
    (step.advance instanceof RegExp && step.advance.test(pathname))
    || (typeof step.advance === 'function' && (() => { try { return (step.advance as () => boolean)(); } catch { return false; } })()),
  );
  useEffect(() => {
    if (doneAtStart.current) { next(); return; }
    if (step.route && !step.route.test(pathname) && step.goTo) navigate(step.goTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The user left the page this step is about (e.g. "Back to Dashboard" in the middle of a report task): the tour
  // closes quietly instead of explaining a screen that is no longer there.
  const arrived = useRef(false);
  useEffect(() => {
    if (!step.route || doneAtStart.current) return;
    if (step.route.test(pathname)) { arrived.current = true; return; }
    if (arrived.current || !step.goTo) {
      const t = window.setTimeout(() => onFinish(false), 1200);
      return () => window.clearTimeout(t);
    }
  }, [pathname, step.route, step.goTo, onFinish]);

  // Find the target (it may appear after a navigation or an animation), then keep its rectangle current.
  useEffect(() => {
    if (!step.target) { setSearching(false); return; }
    let stop = false; let found: HTMLElement | null = null; const t0 = Date.now(); let scrolled = false;
    const tick = () => {
      if (stop) return;
      const cur = findTarget(step.target);
      if (cur !== found) { found = cur; setEl(cur); }
      if (cur) {
        if (!scrolled) {
          scrolled = true;
          // Only when it is off screen, and at once: a smooth scroll made the card slide around with it.
          const r = cur.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) cur.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        }
        setRect(cur.getBoundingClientRect()); setSearching(false);
      } else if (Date.now() - t0 > 4000) {
        setSearching(false);
        if (step.optional) { stop = true; next(); return; }   // not on this screen (e.g. no annotation yet): skip
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { stop = true; };
  }, [step, next]);

  // … or when the app reaches a page (e.g. a report was opened) …
  const [success, setSuccess] = useState(false);
  const fired = useRef(false);   // one success per step, however many signals arrive
  const succeed = useCallback(() => { if (fired.current) return; fired.current = true; setSuccess(true); window.setTimeout(next, 900); }, [next]);
  useEffect(() => {
    if (!doneAtStart.current && step.advance instanceof RegExp && step.advance.test(pathname)) succeed();
  }, [pathname, step.advance, succeed]);
  // … or when something the user did shows on the page (audio playing, a popup open, edit mode on).
  useEffect(() => {
    if (typeof step.advance !== 'function') return;
    const check = step.advance;
    const id = window.setInterval(() => { try { if (check()) { window.clearInterval(id); succeed(); } } catch { /* keep waiting */ } }, 250);
    return () => window.clearInterval(id);
  }, [step.advance, succeed]);

  // "Do it yourself" steps: continue when the user clicks the target …
  useEffect(() => {
    if (step.advance !== 'click' || !el) return;
    const h = () => succeed();
    el.addEventListener('click', h, { once: true, capture: true });
    return () => el.removeEventListener('click', h, { capture: true });
  }, [el, step.advance, succeed]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFinish(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFinish]);

  const pad = 6;
  const hole = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  // The card's REAL height decides where it fits: below the target, above, right, left — and it is always kept
  // inside the window (a tall target such as the sidebar list used to push it off the top). Centred with no target.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(240);
  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); });
  const vw = window.innerWidth, vh = window.innerHeight, M = 12;
  const clampTop = (t: number) => Math.max(M, Math.min(t, vh - cardH - M));
  const clampLeft = (l: number) => Math.max(M, Math.min(l, vw - CARD_W - M));
  let cardStyle: React.CSSProperties;
  if (!hole) cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  else {
    const centredLeft = clampLeft(hole.left + hole.width / 2 - CARD_W / 2);
    if (hole.top + hole.height + M + cardH < vh) cardStyle = { top: hole.top + hole.height + M, left: centredLeft };
    else if (hole.top - M - cardH > 0) cardStyle = { top: hole.top - M - cardH, left: centredLeft };
    else if (hole.left + hole.width + M + CARD_W < vw) cardStyle = { top: clampTop(hole.top), left: hole.left + hole.width + M };
    else if (hole.left - M - CARD_W > 0) cardStyle = { top: clampTop(hole.top), left: hole.left - M - CARD_W };
    else cardStyle = { top: clampTop(vh - cardH - M), left: centredLeft };
  }
  const waitingClick = !!step.advance;   // any "do it yourself" step
  const waitingRoute = false;

  return createPortal(
    <div className="fixed inset-0 z-[1000] pointer-events-none" aria-live="polite">
      {/* Dim everything except the target (the hole). The page stays clickable. */}
      {hole ? (
        <div className="absolute rounded-lg ring-2 ring-sky-400 transition-all duration-200"
          style={{ ...hole, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }} />
      ) : (
        <div className="absolute inset-0 bg-slate-900/55" />
      )}
      <div role="dialog" aria-label={tour.title} ref={cardRef}
        className="absolute pointer-events-auto rounded-xl bg-white shadow-2xl border border-gray-200 p-4"
        style={{ ...cardStyle, width: CARD_W }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">{tour.title}</span>
          <span className="text-[11px] text-gray-400 tabular-nums ml-auto">{index + 1} / {tour.steps.length}</span>
          <button onClick={() => onFinish(false)} className="text-gray-400 hover:text-gray-700 -mr-1" aria-label="Close the guide" data-track="Guide: close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="font-semibold text-gray-900 leading-snug">{step.title}</h3>
        <div className="text-sm text-gray-600 mt-1.5 leading-relaxed space-y-1.5">{step.body}</div>
        {step.tip && (
          <div className="mt-2.5 flex gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-2 text-xs text-amber-900">
            <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{step.tip}</span>
          </div>
        )}
        {searching && <p className="mt-2 text-xs text-gray-400">Finding it on the page…</p>}
        {success ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Nice — that’s it!
          </p>
        ) : (waitingClick || waitingRoute) && !searching && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-sky-700 animate-pulse">
            <MousePointerClick className="w-3.5 h-3.5" /> {step.doIt || 'Try it: click the highlighted item.'}
          </p>
        )}
        <div className="flex items-center gap-2 mt-3">
          {index > 0 && (
            <button onClick={back} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <div className="flex-1" />
          <button onClick={next} data-track="Guide: next"
            className={`inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md ${waitingClick || waitingRoute ? 'text-gray-600 hover:bg-gray-100' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {waitingClick || waitingRoute ? <>Skip <ArrowRight className="w-3.5 h-3.5" /></> : last ? <><CheckCircle2 className="w-3.5 h-3.5" /> Done</> : <>Next <ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

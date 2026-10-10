import { CheckCircle2, Clock3, Lock, ShieldCheck } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { appConfig } from '@/shared/config/env';
import { BrandLogo } from '@/shared/components/brand-logo';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { AUTH_SHOWCASE, type ShowcaseRow } from '../auth-showcase';
import { SystemStatusLine } from './system-status-line';

const LEGAL_LINKS = [
  { label: 'Privacy', href: appConfig.privacyUrl },
  { label: 'Terms', href: appConfig.termsUrl },
  { label: 'Security', href: appConfig.securityUrl },
].filter((link) => link.href);

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** Layout of the sign-in, forgot-password and set-password screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* ─── Brand canvas ────────────────────────────────────── */}
      <aside className="relative isolate hidden overflow-hidden bg-[#071a33] text-slate-300 lg:flex lg:flex-col">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_0%_0%,#0e3a6e_0%,#071a33_55%,#04101f_100%)]" />
        <div aria-hidden className="auth-grid absolute inset-0 -z-10" />
        <div aria-hidden className="absolute -right-24 top-1/3 -z-10 size-[28rem] rounded-full bg-sky-500/10 blur-[110px]" />

        <header className="flex items-center justify-between px-10 pt-9 xl:px-14">
          <BrandLogo inverted compact className="[&_img]:h-9 [&_img]:max-w-[11rem]" />
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            {appConfig.name}
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-10 px-10 py-10 xl:px-14">
          <ol className="space-y-1">
            {AUTH_SHOWCASE.steps.map((step, index) => (
              <li key={step.word} className="auth-rise flex items-baseline gap-4" style={delay(120 + index * 110)}>
                <span className="w-7 font-mono text-xs text-sky-300/70">0{index + 1}</span>
                <span
                  className={
                    index === AUTH_SHOWCASE.steps.length - 1
                      ? 'bg-gradient-to-r from-sky-300 to-emerald-300 bg-clip-text text-5xl font-semibold tracking-tight text-transparent xl:text-6xl'
                      : 'text-5xl font-semibold tracking-tight text-white xl:text-6xl'
                  }
                >
                  {step.word}.
                </span>
                <span className="hidden text-sm text-slate-400 2xl:inline">{step.detail}</span>
              </li>
            ))}
          </ol>
          {appConfig.description && (
            <p className="auth-rise max-w-md text-[15px] leading-relaxed text-slate-400" style={delay(480)}>
              {appConfig.description}
            </p>
          )}
          <PlanIllustration />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-10 py-5 text-xs text-slate-500 xl:px-14">
          <span className="flex flex-wrap items-center gap-x-2">
            © {year} {appConfig.companyName}
            <span aria-hidden>·</span>
            <SystemStatusLine />
          </span>
          {LEGAL_LINKS.length > 0 && (
            <nav className="flex gap-5">
              {LEGAL_LINKS.map((link) => (
                <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
                  {link.label}
                </a>
              ))}
            </nav>
          )}
        </footer>
      </aside>

      {/* ─── Form ────────────────────────────────────────────── */}
      <main className="relative flex flex-col">
        <MobileBand />
        <div className="flex h-16 items-center justify-end px-6 sm:px-10">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-10">
          <div className="w-full max-w-[400px] animate-pop-in">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
              <ShieldCheck className="size-3.5" /> {appConfig.companyName ? `${appConfig.companyName} workspace` : 'Secure workspace'}
            </span>
            <h1 className="mt-4 text-[2rem] font-semibold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="px-6 pb-6 text-center text-xs text-muted">
          <Lock className="mr-1.5 inline size-3.5 align-[-2px]" />
          Encrypted sessions and hashed passwords protect your workspace.
        </p>
      </main>
    </div>
  );
}

/** An illustrative project plan that draws itself: bars grow in, "today" pulses, status cards float. */
function PlanIllustration() {
  const { weeks, rows, today } = AUTH_SHOWCASE;
  const pct = (week: number) => `${(week / weeks.length) * 100}%`;
  return (
    <div aria-hidden className="auth-rise relative max-w-xl" style={delay(560)}>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-200">Q4 rollout plan</span>
          <span className="flex items-center gap-1.5 text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" /> On track
          </span>
        </div>

        <div className="grid grid-cols-[7.5rem_1fr] gap-x-3">
          <span />
          <div className="relative grid grid-cols-8 pb-2 font-mono text-[10px] text-slate-500">
            {weeks.map((week) => (
              <span key={week}>{week}</span>
            ))}
          </div>

          {rows.map((row, index) => (
            <PlanRow key={row.label} row={row} index={index} pct={pct} />
          ))}
        </div>

        {/* Today marker spans the rows. */}
        <div className="pointer-events-none absolute inset-y-14 left-[calc(1.25rem+7.5rem+0.75rem)] right-5">
          <div className="absolute inset-y-0 w-px bg-sky-300/80" style={{ left: pct(today) }}>
            <span className="auth-glow absolute -inset-x-1 inset-y-0 bg-sky-300/40 blur-[3px]" />
            <span className="absolute -top-5 -translate-x-1/2 rounded bg-sky-400 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#04101f]">TODAY</span>
          </div>
        </div>
      </div>

      <div className="auth-float absolute -right-6 -top-7 hidden xl:block" style={delay(0)}>
        <div className="auth-rise flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0b2547]/90 px-3.5 py-2.5 shadow-xl shadow-black/30 backdrop-blur" style={delay(1500)}>
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span className="text-xs">
            <span className="block font-medium text-white">Timesheet approved</span>
            <span className="text-slate-400">32.5 h · Week 41</span>
          </span>
        </div>
      </div>
      <div className="auth-float absolute -bottom-6 right-10 hidden xl:block" style={{ animationDelay: '-3s' }}>
        <div className="auth-rise flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0b2547]/90 px-3.5 py-2.5 shadow-xl shadow-black/30 backdrop-blur" style={delay(1800)}>
          <Clock3 className="size-4 text-amber-300" />
          <span className="text-xs">
            <span className="block font-medium text-white">Go-live milestone</span>
            <span className="text-slate-400">in 23 days</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function PlanRow({ row, index, pct }: { row: ShowcaseRow; index: number; pct: (week: number) => string }) {
  return (
    <>
      <span className="truncate py-2 text-xs text-slate-300">{row.label}</span>
      <div className="relative py-2">
        <div className="absolute inset-0 grid grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="border-l border-white/[0.05]" />
          ))}
        </div>
        <div className="relative h-5" style={{ marginLeft: pct(row.start), width: pct(row.span) }}>
          <div className="auth-bar absolute inset-0 overflow-hidden rounded-md" style={{ backgroundColor: `${row.color}33`, ...delay(700 + index * 160) }}>
            <div className="h-full rounded-md" style={{ width: `${row.done}%`, backgroundColor: row.color }} />
          </div>
          {row.milestone && (
            <span
              className="auth-rise absolute -right-2 top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-[#071a33] shadow"
              style={{ backgroundColor: row.color, ...delay(1400) }}
            />
          )}
        </div>
      </div>
    </>
  );
}

/** Small screens: a compact brand band with a miniature plan instead of the full canvas. */
function MobileBand() {
  return (
    <div className="relative overflow-hidden bg-[#071a33] px-6 pb-5 pt-6 lg:hidden">
      <div aria-hidden className="auth-grid absolute inset-0" />
      <div className="relative flex items-center justify-between">
        <BrandLogo inverted compact className="[&_img]:h-7" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">{appConfig.name}</span>
      </div>
      <div aria-hidden className="relative mt-5 space-y-1.5">
        {AUTH_SHOWCASE.rows.map((row, index) => (
          <div key={row.label} className="h-1.5" style={{ marginLeft: `${(row.start / 8) * 100}%`, width: `${(row.span / 8) * 100}%` }}>
            <div className="auth-bar h-full rounded-full" style={{ backgroundColor: row.color, ...delay(200 + index * 120) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

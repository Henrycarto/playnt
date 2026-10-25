import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Icon, type IconName } from './Icon';
import { useHealth } from '../hooks';
import { ShortcutsDialog, useShortcutsKey } from './Shortcuts';

type Theme = 'system' | 'light' | 'dark';

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem('playnt-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { if (theme === 'system') localStorage.removeItem('playnt-theme'); else localStorage.setItem('playnt-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, setTheme];
}

const NAV: [string, string, IconName][] = [
  ['/', 'Queue', 'queue'],
  ['/new', 'Log complaint', 'log'],
  ['/trends', 'Trends', 'trend'],
  ['/audit', 'Audit trail', 'audit'],
  ['/sources', 'Sources', 'source'],
];

// The identity icon from assets/brand/icon.svg, drawn inline in the accent so it follows the theme.
function BrandMark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="12.5" width="7.5" height="7.5" rx="2" strokeDasharray="0 3" />
      <rect x="13.5" y="12.5" width="7.5" height="7.5" rx="2" fill="currentColor" stroke="none" />
      <path d="M6.75 9C7.5 6 9.5 4.5 12 4.5s4.5 1.5 5.25 4.5" />
      <path d="M15.25 7.5l2 1.5 1.5-2" />
    </svg>
  );
}

export function Shell() {
  const [theme, setTheme] = useTheme();
  const health = useHealth();
  const [keysOpen, setKeysOpen] = useState(false);
  useShortcutsKey(setKeysOpen);
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side"><div className="side-inner">
        <NavLink to="/" className="brand"><BrandMark />Playnt</NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} size={16} />{label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="sim">Synthetic data. Not a validated quality management system.</div>
          <div className="who">
            Signed in as Quality engineer (demo)<br />Orrowell Medical GmbH, fictional
            {health && <><br />{health.mode === 'demo' ? `Demo mode: recorded ${health.model} responses, clock fixed at ${new Date(health.now).toLocaleString('en-GB', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' }).replace('Sept', 'Sep')} Vienna` : `Live model: ${health.model}`}</>}
          </div>
          <button type="button" className="helpbtn" onClick={() => setKeysOpen(true)}><kbd className="kbd">?</kbd>Keyboard shortcuts</button>
          <div className="theme" role="group" aria-label="Colour theme">
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </div></aside>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
    </div>
  );
}

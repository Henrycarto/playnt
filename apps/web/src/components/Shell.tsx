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

export function Shell() {
  const [theme, setTheme] = useTheme();
  const health = useHealth();
  const [keysOpen, setKeysOpen] = useState(false);
  useShortcutsKey(setKeysOpen);
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side"><div className="side-inner">
        <NavLink to="/" className="brand">Playnt</NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} size={16} />{label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="sim">Synthetic data. Not a validated quality management system.</div>
          <div className="who">
            Signed in as Quality engineer (demo)<br />Orrowell Medical GmbH, fictional
            {health && <><br />{health.mode === 'demo' ? `Demo mode: recorded ${health.model} responses, clock fixed at ${new Date(health.now).toLocaleString('en-GB', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' })} Vienna` : `Live model: ${health.model}`}</>}
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

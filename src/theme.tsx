import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
const THEME_KEY = 'writing-award:theme:v1';
const SYSTEM_THEME = '(prefers-color-scheme: dark)';
const validPreference = (value: string | null): ThemePreference => value === 'light' || value === 'dark' ? value : 'system';
const ThemeContext = createContext<{
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (value: ThemePreference) => void;
  storageWarning: boolean;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(() => {
    try { return validPreference(localStorage.getItem(THEME_KEY)); } catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia(SYSTEM_THEME).matches);
  const [storageWarning, setStorageWarning] = useState(false);
  const resolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const media = matchMedia(SYSTEM_THEME);
    const change = () => setSystemDark(media.matches);
    change();
    media.addEventListener('change', change);
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) {
        updatePreference(validPreference(event.newValue));
        setStorageWarning(false);
      }
    };
    window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', change); window.removeEventListener('storage', sync); };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#211e24' : '#fff9f2');
  }, [preference, resolvedTheme]);

  function setPreference(value: ThemePreference) {
    updatePreference(value);
    try { localStorage.setItem(THEME_KEY, value); setStorageWarning(false); } catch { setStorageWarning(true); }
  }
  return <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference, storageWarning }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider is required.');
  return value;
}

export function ThemeToggle() {
  const { resolvedTheme, setPreference } = useTheme();
  const dark = resolvedTheme === 'dark';
  const action = dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
  return <button className="icon-button theme-toggle" aria-label={action} title={action} onClick={() => setPreference(dark ? 'light' : 'dark')}>
    {dark ? <Sun aria-hidden="true" size={20} /> : <Moon aria-hidden="true" size={20} />}
  </button>;
}

export function AppearanceSettings() {
  const { preference, resolvedTheme, setPreference, storageWarning } = useTheme();
  return <div className="settings-group appearance-settings">
    <h2>Giao diện</h2>
    <fieldset className="appearance-fieldset" aria-describedby="appearance-note">
      <legend>Chọn chế độ hiển thị</legend>
      <div className="appearance-options">{([
        { value: 'light', label: 'Sáng', icon: Sun },
        { value: 'dark', label: 'Tối', icon: Moon },
        { value: 'system', label: 'Theo hệ thống', icon: Monitor },
      ] as const).map(({ value, label, icon: Icon }) => <label key={value} className={preference === value ? 'selected' : ''}>
        <input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => setPreference(value)} />
        <Icon aria-hidden="true" size={20} /><span>{label}</span>{preference === value && <Check aria-hidden="true" size={15} className="appearance-check" />}
      </label>)}</div>
    </fieldset>
    <p id="appearance-note" className="appearance-note">{preference === 'system'
      ? `Tự đổi theo thiết bị của bạn. Hiện đang dùng giao diện ${resolvedTheme === 'dark' ? 'tối' : 'sáng'}.`
      : 'Lựa chọn này được lưu riêng trên trình duyệt, cùng bạn mỗi lần quay lại.'}</p>
    {storageWarning && <p className="form-error" role="status">Chưa lưu được lựa chọn. Giao diện vẫn áp dụng trong phiên này.</p>}
  </div>;
}

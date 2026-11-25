import { useEffect, useState } from 'react';
import { webDarkTheme, webLightTheme, type Theme } from '@fluentui/react-components';

export type FluentColorScheme = 'dark' | 'light';

function readColorScheme(): FluentColorScheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Bridges the app's `.dark` root class (driven by `applyThemePreference`)
 * into the Fluent UI v9 web themes.
 */
export function useFluentTheme(): Theme {
  const [scheme, setScheme] = useState<FluentColorScheme>(readColorScheme);

  useEffect(() => {
    setScheme(readColorScheme());
    const observer = new MutationObserver(() => setScheme(readColorScheme()));
    observer.observe(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    });
    return () => observer.disconnect();
  }, []);

  return scheme === 'dark' ? webDarkTheme : webLightTheme;
}

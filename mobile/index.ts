import { registerRootComponent } from 'expo';
import { createElement, useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';

import { loadBackdrop, onRedraw } from './src/backdrop';
import { installBootErrorTrap } from './src/boot-errors';

// Before the first render, so a module that dies initializing is
// caught with its real name - see src/boot-errors.ts for the why.
installBootErrorTrap();

/*
 * The player's backdrop (green-black or pure black, src/backdrop.ts) is
 * read and applied BEFORE the app's own modules load: App is required
 * only once it is in place, so every colour a screen reads at load time
 * is already the chosen one. A change in Settings redraws the whole app
 * by remounting it here, and App puts the screen back where it was.
 */
function Root() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void loadBackdrop().then(() => {
      if (!live) return;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require('./App').default as ComponentType;
      setApp(() => loaded);
    });
    onRedraw(() => setVersion((value) => value + 1));
    return () => {
      live = false;
      onRedraw(null);
    };
  }, []);

  if (!App) return createElement(View, { style: { flex: 1, backgroundColor: '#000000' } });
  return createElement(App, { key: version });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);

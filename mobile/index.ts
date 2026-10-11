import { registerRootComponent } from 'expo';

import App from './App';
import { installBootErrorTrap } from './src/boot-errors';

// Before the first render, so a module that dies initializing is
// caught with its real name - see src/boot-errors.ts for the why.
installBootErrorTrap();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

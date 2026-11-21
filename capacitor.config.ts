import type {CapacitorConfig} from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'io.github.intouchktakizawa.sleeve',
  appName: 'Sleeve',
  webDir: 'ios-dist',
  backgroundColor: '#111311',
  ios: {contentInset: 'never', scrollEnabled: true, limitsNavigationsToAppBoundDomains: false},
  plugins: {
    SplashScreen: {launchAutoHide: false, backgroundColor: '#111311', showSpinner: false},
    StatusBar: {overlaysWebView: true, style: 'DARK'},
  },
};
export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.nawy.cadview',
  appName: 'CAD-VIEW',
  webDir: 'dist',
  android: {
    // لا محتوى مختلط ولا اتصال خارجي: التطبيق كله محلي
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

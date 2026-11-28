import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.nawy.cadview',
  appName: 'CAD-VIEW',
  // CAP_WEB_DIR=dist-nodwg لتغليف النسخة بلا DWG (راجع docs/DWG-ENGINES.md)
  webDir: process.env.CAP_WEB_DIR ?? 'dist',
  android: {
    // لا محتوى مختلط ولا اتصال خارجي: التطبيق كله محلي
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

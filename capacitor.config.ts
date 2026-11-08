import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mehmetipa.signer',
  appName: 'Mehmet IPA',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  }
};

export default config;

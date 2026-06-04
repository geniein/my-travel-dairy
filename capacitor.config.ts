import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.traveldiary.app',
  appName: 'Pastel Journey',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

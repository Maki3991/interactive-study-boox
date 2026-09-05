import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'xyz.maki3991.interactivestudy',
  appName: 'Interactive Study',
  webDir: 'dist',
  server: {
    url: 'https://www.maki3991.xyz',
    cleartext: false,
    androidScheme: 'https',
  },
}

export default config

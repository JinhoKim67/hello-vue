/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Styles (Vuetify 먼저)
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import 'unfonts.css'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Styles
import 'unfonts.css'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
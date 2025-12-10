// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	css: ['~/assets/reset.css'],
	compatibilityDate: '2025-07-15',
	devtools: { enabled: true },
	modules: ['@vueuse/nuxt'],
})

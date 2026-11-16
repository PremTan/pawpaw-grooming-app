// src/utils/leafletLoader.js
// Singleton loader for Leaflet map library from CDN

export const loadLeaflet = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    if (window.L) return resolve(window.L)

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    if (window._leafletLoadingPromise) {
      return window._leafletLoadingPromise.then(resolve)
    }

    window._leafletLoadingPromise = new Promise((res) => {
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.async = true
      script.onload = () => {
        res(window.L)
        resolve(window.L)
      }
      script.onerror = () => {
        console.warn('Failed to load Leaflet script from CDN')
        res(null)
        resolve(null)
      }
      document.head.appendChild(script)
    })
  })
}

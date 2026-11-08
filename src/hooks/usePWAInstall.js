// src/hooks/usePWAInstall.js
import { useState, useEffect, useCallback } from 'react'

let cachedPromptEvent = null

// Capture beforeinstallprompt as early as possible
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    cachedPromptEvent = e
    window.dispatchEvent(new CustomEvent('pwa-prompt-ready'))
  })
}

function detectIsStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
    window.navigator.standalone === true
  )
}

function detectIsIOS() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator?.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) && !window.MSStream
}

export function usePWAInstall() {
  const [isStandalone, setIsStandalone] = useState(detectIsStandalone)
  const [isInstalled, setIsInstalled] = useState(detectIsStandalone)
  const [deferredPrompt, setDeferredPrompt] = useState(cachedPromptEvent)
  const [isIOS] = useState(detectIsIOS)
  const [showIOSModal, setShowIOSModal] = useState(false)

  useEffect(() => {
    // 1. Standalone media query listener
    const mediaQuery = window.matchMedia?.('(display-mode: standalone)')
    const handleMediaChange = (e) => {
      if (e.matches) {
        setIsStandalone(true)
        setIsInstalled(true)
        setShowIOSModal(false)
      }
    }
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange)
    }

    // 2. beforeinstallprompt listener
    const handlePrompt = (e) => {
      e.preventDefault()
      cachedPromptEvent = e
      setDeferredPrompt(e)
    }

    const handlePromptReady = () => {
      if (cachedPromptEvent) {
        setDeferredPrompt(cachedPromptEvent)
      }
    }

    // 3. appinstalled listener (when installation finishes, auto-hide the button)
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsStandalone(true)
      cachedPromptEvent = null
      setDeferredPrompt(null)
      setShowIOSModal(false)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('pwa-prompt-ready', handlePromptReady)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Check if prompt became ready before mount
    if (cachedPromptEvent && !deferredPrompt) {
      setDeferredPrompt(cachedPromptEvent)
    }

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange)
      }
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('pwa-prompt-ready', handlePromptReady)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [deferredPrompt])

  const promptInstall = useCallback(async () => {
    if (isStandalone || isInstalled) return

    // iOS Safari: Show the 3-step Safari Share guide
    if (isIOS) {
      setShowIOSModal(true)
      return
    }

    // Android / Chrome / Edge: Directly trigger the native browser install dialog!
    let promptEvent = deferredPrompt || cachedPromptEvent

    if (!promptEvent) {
      // If prompt event is arriving, wait up to 1 second
      promptEvent = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 1000)
        const onReady = () => {
          clearTimeout(timer)
          window.removeEventListener('pwa-prompt-ready', onReady)
          resolve(cachedPromptEvent)
        }
        window.addEventListener('pwa-prompt-ready', onReady)
      })
    }

    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        if (choice?.outcome === 'accepted') {
          setIsInstalled(true)
          cachedPromptEvent = null
          setDeferredPrompt(null)
        }
      } catch (err) {
        console.warn('Native install prompt failed:', err)
      }
    }
  }, [deferredPrompt, isIOS, isInstalled, isStandalone])

  // Show only when:
  // - Not running in standalone app
  // - Not already installed
  // - On iOS: always ready for Safari Share instructions
  // - On Android / Chrome: ready when the native install prompt is available
  const canShowInstall = !isStandalone && !isInstalled && (isIOS || Boolean(deferredPrompt || cachedPromptEvent))

  return {
    canShowInstall,
    isInstalled,
    isIOS,
    showIOSModal,
    setShowIOSModal,
    promptInstall,
  }
}

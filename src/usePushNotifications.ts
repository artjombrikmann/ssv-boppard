import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const VAPID_PUBLIC_KEY = 'BOK7Xz5f03J0kbUU1SY4nYifzyvlYltdicFYxp6kMhsgWtblytN8HbRe_jh_SS-4bQ0kteq5BGoGxuNqu9iXo5M'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}

export function usePushNotifications(userId: string | undefined) {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed]   = useState(false)

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      return reg
    } catch (err) {
      console.error('SW Registrierung fehlgeschlagen:', err)
      return null
    }
  }

  async function subscribe() {
    if (!userId) return
    const reg = await registerServiceWorker()
    if (!reg) return

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const sub = subscription.toJSON()

      // Subscription in Supabase speichern
      await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys?.p256dh,
        auth: sub.keys?.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      setSubscribed(true)
    } catch (err) {
      console.error('Push Subscription Fehler:', err)
    }
  }

  async function unsubscribe() {
    if (!userId) return
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    setSubscribed(false)
  }

  // Prüfen ob bereits subscribed
  useEffect(() => {
    if (!userId) return
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub)
      })
    })
  }, [userId])

  return { permission, subscribed, subscribe, unsubscribe }
}

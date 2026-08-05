import { usePushNotifications } from '../usePushNotifications'

interface Props { userId: string }

export default function NotificationToggle({ userId }: Props) {
  const { permission, subscribed, subscribe, unsubscribe } = usePushNotifications(userId)

  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  if (!isSupported) return (
    <div style={{ background:'#fff7ed', borderRadius:12, padding:'10px 14px', fontSize:12, color:'#b45309' }}>
      ℹ️ Dein Browser unterstützt keine Push-Benachrichtigungen. Nutze Chrome auf Android für beste Erfahrung.
    </div>
  )

  return (
    <div style={{ background:'#fff', borderRadius:16, padding:16, border:'1px solid #f3f4f6' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: subscribed ? 12 : 0 }}>
        <div>
          <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14, color:'#111827' }}>
            Push-Benachrichtigungen
          </p>
          <p style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>
            {subscribed
              ? '✅ Aktiviert – du bekommst Schicht-Erinnerungen'
              : permission === 'denied'
              ? '❌ Blockiert – bitte in Browser-Einstellungen erlauben'
              : 'Erhalte Benachrichtigungen für Schichten & Punkte'}
          </p>
        </div>

        {/* Toggle */}
        {permission !== 'denied' && (
          <div
            onClick={subscribed ? unsubscribe : subscribe}
            style={{
              width: 48, height: 26, borderRadius: 99,
              background: subscribed ? '#0d631b' : '#e5e7eb',
              position: 'relative', cursor: 'pointer',
              transition: 'background .2s', flexShrink: 0, marginLeft: 12,
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: subscribed ? 25 : 3,
              width: 20, height: 20,
              borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,.15)',
              transition: 'left .2s',
            }} />
          </div>
        )}
      </div>

      {/* Was wird benachrichtigt */}
      {subscribed && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {[
            { icon:'📋', text:'Schicht-Zuweisung durch Admin' },
            { icon:'🔔', text:'Erinnerung 5 & 2 Tage vorher' },
            { icon:'⭐', text:'Punkte wurden vergeben' },
          ].map(item => (
            <div key={item.text} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#5d5e61' }}>
              <span>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

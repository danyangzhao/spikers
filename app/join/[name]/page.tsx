import { Metadata } from 'next'

type Props = {
  params: Promise<{ name: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params
  return {
    title: `Join ${decodeURIComponent(name)} on Spikers`,
    description: `Join the ${decodeURIComponent(name)} group on Spikers to track volleyball games with your crew!`,
  }
}

export default async function JoinPage({ params }: Props) {
  const { name } = await params
  const groupName = decodeURIComponent(name).toUpperCase()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#14120b',
      color: '#edecec',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '400px',
      }}>
        <div style={{ fontSize: '72px', marginBottom: '16px' }}>🏐</div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
          Join <span style={{ color: '#f54e00' }}>{groupName}</span>
        </h1>
        <p style={{ color: 'rgba(237,236,236,0.6)', marginBottom: '32px' }}>
          Open the Spikers app and type <strong style={{ color: '#f54e00' }}>{groupName}</strong> to join this group.
        </p>
        <p style={{ color: 'rgba(237,236,236,0.4)', fontSize: '14px' }}>
          Don&apos;t have the app yet? Search for <strong>Spikers</strong> on the App Store.
        </p>
      </div>
    </div>
  )
}

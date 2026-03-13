import { useEffect, useMemo, useState } from 'react';

function getLevelColor(level) {
  switch (Number(level)) {
    case 1:
      return '#ff4d4f';
    case 2:
      return '#fa8c16';
    case 3:
      return '#fadb14';
    case 4:
      return '#52c41a';
    case 5:
      return '#1677ff';
    default:
      return '#8c8c8c';
  }
}

function getLevelLabel(level) {
  switch (Number(level)) {
    case 1:
      return 'Resuscitation';
    case 2:
      return 'Emergent';
    case 3:
      return 'Urgent';
    case 4:
      return 'Less urgent';
    case 5:
      return 'Non-urgent';
    default:
      return 'Unknown';
  }
}

export default function QueueDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
  const loadQueueStats = () => {
    fetch('/api/triage/queue-stats')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          throw new Error(data.error || 'Failed to load queue stats');
        }
        return data;
      })
      .then((data) => {
        setStats({
          waiting: Number(data.waiting || 0),
          levels: Array.isArray(data.levels) ? data.levels : [],
          recent: Array.isArray(data.recent) ? data.recent : [],
        });
        setLastUpdated(new Date());
        setError('');
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      });
  };

  loadQueueStats();
  const intervalId = setInterval(loadQueueStats, 5000);

  return () => clearInterval(intervalId);
}, []);

  const maxCount = useMemo(() => {
    if (!stats?.levels?.length) return 1;
    return Math.max(...stats.levels.map((level) => Number(level.count) || 0), 1);
  }, [stats]);

  if (error) {
    return (
      <div style={{ padding: '48px', color: 'white', maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '42px', marginBottom: '16px' }}>Queue Dashboard</h1>
        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: '48px', color: 'white', maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '42px', marginBottom: '16px' }}>Queue Dashboard</h1>
        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <p>Loading queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '48px', color: 'white', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
  <h1 style={{ fontSize: '42px', marginBottom: '6px' }}>
    Emergency Department Queue
  </h1>

  {lastUpdated && (
    <div style={{ opacity: 0.7, fontSize: '14px' }}>
      Last updated: {lastUpdated.toLocaleTimeString()}
    </div>
  )}
</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>Patients waiting</p>
          <p style={{ margin: '10px 0 0 0', fontSize: '44px', fontWeight: '700' }}>{stats.waiting}</p>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>Active triage levels</p>
          <p style={{ margin: '10px 0 0 0', fontSize: '44px', fontWeight: '700' }}>
            {stats.levels.length}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Triage distribution</h2>

          {stats.levels.length === 0 ? (
            <p style={{ margin: 0 }}>No waiting cases yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {stats.levels.map((level) => {
                const count = Number(level.count) || 0;
                const triageLevel = Number(level.automated_triage_level);
                const width = `${(count / maxCount) * 100}%`;

                return (
                  <div key={triageLevel}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        marginBottom: '8px',
                        fontSize: '15px',
                      }}
                    >
                      <span>
                        <strong style={{ color: getLevelColor(triageLevel) }}>
                          Level {triageLevel}
                        </strong>{' '}
                        — {getLevelLabel(triageLevel)}
                      </span>
                      <span>{count} patient{count !== 1 ? 's' : ''}</span>
                    </div>

                    <div
  style={{
    height: '12px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
  }}
>
                     <div
  style={{
    width,
    height: '100%',
    borderRadius: '999px',
    background: getLevelColor(triageLevel),
    transition: 'width 0.6s ease, background 0.3s ease',
  }}
/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Recent cases</h2>

          {stats.recent.length === 0 ? (
            <p style={{ margin: 0 }}>No recent cases yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {stats.recent.map((c) => (
                <div
  key={c.id}
  style={{
    padding: '14px 16px',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'transform 0.2s ease, background 0.2s ease',
  }}
>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <strong>#{c.id}</strong>
                    <span
                      style={{
                        color: getLevelColor(c.automated_triage_level),
                        fontWeight: '700',
                      }}
                    >
                      Level {c.automated_triage_level}
                    </span>
                  </div>

                  <div style={{ opacity: 0.92 }}>
                    {c.chief_complaint || 'No complaint'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
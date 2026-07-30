'use client';

import { useState, useTransition } from 'react';
import { createOrg } from '@/actions/platform';

interface Org {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
}

interface Props {
  initialOrgs: Org[];
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

export function PlatformClient({ initialOrgs }: Props) {
  const [orgs, setOrgs]               = useState<Org[]>(initialOrgs);
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const [firmName,   setFirmName]   = useState('');
  const [firmSlug,   setFirmSlug]   = useState('');
  const [adminName,  setAdminName]  = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  function handleFirmNameChange(v: string) {
    setFirmName(v);
    setFirmSlug(slugify(v));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    startTransition(async () => {
      const res = await createOrg({ firm_name: firmName, firm_slug: firmSlug, admin_name: adminName, admin_email: adminEmail });

      if (res.error !== null) {
        setError(res.error);
        return;
      }

      setSuccess(`✓ Organisation created. Invite email sent to ${adminEmail}.`);
      setOrgs((prev) => [
        ...prev,
        { id: res.data.org_id, name: firmName, slug: firmSlug, created_at: new Date() },
      ]);
      setFirmName('');
      setFirmSlug('');
      setAdminName('');
      setAdminEmail('');
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5', fontFamily: 'system-ui, sans-serif', padding: '40px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
            Filio Platform Admin
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#fff' }}>Onboard a new firm</h1>
          <p style={{ color: '#888', marginTop: 8, fontSize: 14 }}>
            Creates the org, admin profile, and sends an invite email in one step. No SQL required.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 32, marginBottom: 48 }}>
          <div style={{ display: 'grid', gap: 20 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Firm name" required>
                <input
                  value={firmName}
                  onChange={(e) => handleFirmNameChange(e.target.value)}
                  placeholder="Sharma & Associates"
                  required
                  style={inputStyle}
                />
              </Field>
              <Field label="Slug (URL identifier)" required>
                <input
                  value={firmSlug}
                  onChange={(e) => setFirmSlug(e.target.value)}
                  placeholder="sharma-associates"
                  required
                  pattern="[a-z0-9-]+"
                  style={inputStyle}
                />
                <span style={{ fontSize: 11, color: '#555', marginTop: 4, display: 'block' }}>
                  lowercase, hyphens only
                </span>
              </Field>
            </div>

            <div style={{ height: 1, background: '#2a2a2a' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Founding partner name" required>
                <input
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Rajesh Sharma"
                  required
                  style={inputStyle}
                />
              </Field>
              <Field label="Founding partner email" required>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="rajesh@sharmaassociates.com"
                  required
                  style={inputStyle}
                />
              </Field>
            </div>

            {error && (
              <div style={{ background: '#2a1515', border: '1px solid #5a2020', borderRadius: 8, padding: '12px 16px', color: '#ff6b6b', fontSize: 14 }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{ background: '#152a1a', border: '1px solid #2a5a30', borderRadius: 8, padding: '12px 16px', color: '#6bcf7f', fontSize: 14 }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                background: isPending ? '#333' : '#fff',
                color: isPending ? '#888' : '#000',
                border: 'none',
                borderRadius: 8,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                alignSelf: 'flex-start',
              }}
            >
              {isPending ? 'Creating…' : 'Create org & send invite'}
            </button>
          </div>
        </form>

        {/* Orgs list */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16 }}>
            Onboarded organisations ({orgs.length})
          </h2>

          {orgs.length === 0 ? (
            <p style={{ color: '#555', fontSize: 14 }}>No organisations yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {orgs.map((org) => (
                <div key={org.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{org.name}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>/{org.slug}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    {new Date(org.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6, letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#ff6b6b', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#111',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: '#e5e5e5',
  outline: 'none',
  boxSizing: 'border-box',
};

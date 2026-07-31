'use client';

import { useState, useTransition } from 'react';
import { createOrg, createUserInOrg, listOrgMembers } from '@/actions/platform';

interface Org { id: string; name: string; slug: string; created_at: Date }
interface OrgMember { id: string; full_name: string; email: string; user_code: string | null; is_org_admin: boolean; is_active: boolean }
interface Props { initialOrgs: Org[] }

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 40);
}
function codeify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '.').slice(0, 30);
}

// ─── Shared styles ──────────────────────────────────────────────────────────
const card: React.CSSProperties    = { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 32, marginBottom: 32 };
const label: React.CSSProperties   = { display: 'block', fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6, letterSpacing: '0.04em' };
const input: React.CSSProperties   = { width: '100%', background: '#111', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' };
const btnPrimary = (disabled: boolean): React.CSSProperties => ({ background: disabled ? '#333' : '#fff', color: disabled ? '#888' : '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' });
const chip = (on: boolean): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: on ? '#1a3a2a' : '#2a1a1a', color: on ? '#6bcf7f' : '#cf6b6b' });

function Field({ label: l, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label}>{l}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: '#555', marginTop: 4, display: 'block' }}>{hint}</span>}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return msg ? <div style={{ background: '#2a1515', border: '1px solid #5a2020', borderRadius: 8, padding: '10px 14px', color: '#ff6b6b', fontSize: 13 }}>{msg}</div> : null;
}
function SuccessBanner({ msg }: { msg: string }) {
  return msg ? <div style={{ background: '#152a1a', border: '1px solid #2a5a30', borderRadius: 8, padding: '10px 14px', color: '#6bcf7f', fontSize: 13 }}>{msg}</div> : null;
}

// ─── Create Org section ──────────────────────────────────────────────────────
function CreateOrgSection({ onCreated }: { onCreated: (org: Org) => void }) {
  const [isPending, start] = useTransition();
  const [error, setError]  = useState('');
  const [ok, setOk]        = useState('');
  const [firmName,   setFirmName]   = useState('');
  const [firmSlug,   setFirmSlug]   = useState('');
  const [adminName,  setAdminName]  = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  function handleFirmName(v: string) { setFirmName(v); setFirmSlug(slugify(v)); }

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setOk('');
    start(async () => {
      const res = await createOrg({ firm_name: firmName, firm_slug: firmSlug, admin_name: adminName, admin_email: adminEmail });
      if (res.error !== null) { setError(res.error); return; }
      setOk(`✓ Org created. Invite email sent to ${adminEmail}.`);
      onCreated({ id: res.data.org_id, name: firmName, slug: firmSlug, created_at: new Date() });
      setFirmName(''); setFirmSlug(''); setAdminName(''); setAdminEmail('');
    });
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Create new organisation</h2>
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 24px' }}>Creates the org and sends an invite email to the founding partner.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="FIRM NAME">
            <input value={firmName} onChange={e => handleFirmName(e.target.value)} placeholder="Sharma & Associates" required style={input} />
          </Field>
          <Field label="SLUG" hint="lowercase, hyphens only">
            <input value={firmSlug} onChange={e => setFirmSlug(e.target.value)} placeholder="sharma-associates" required pattern="[a-z0-9-]+" style={input} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="PARTNER NAME">
            <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Rajesh Sharma" required style={input} />
          </Field>
          <Field label="PARTNER EMAIL">
            <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="rajesh@sharma.com" required style={input} />
          </Field>
        </div>
        <ErrorBanner msg={error} />
        <SuccessBanner msg={ok} />
        <button type="submit" disabled={isPending} style={btnPrimary(isPending)}>
          {isPending ? 'Creating…' : 'Create org & send invite'}
        </button>
      </form>
    </div>
  );
}

// ─── Add User section ────────────────────────────────────────────────────────
function AddUserSection({ orgs }: { orgs: Org[] }) {
  const [isPending, start]     = useTransition();
  const [error, setError]      = useState('');
  const [ok, setOk]            = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [members, setMembers]  = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [fullName,  setFullName]  = useState('');
  const [userCode,  setUserCode]  = useState('');
  const [password,  setPassword]  = useState('');
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [showPass,  setShowPass]  = useState(false);

  function handleFullName(v: string) { setFullName(v); setUserCode(codeify(v)); }

  async function handleOrgChange(orgId: string) {
    setSelectedOrg(orgId);
    setMembers([]);
    if (!orgId) return;
    setLoadingMembers(true);
    const res = await listOrgMembers(orgId);
    if (res.error === null) setMembers(res.data);
    setLoadingMembers(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setOk('');
    start(async () => {
      const res = await createUserInOrg({ org_id: selectedOrg, full_name: fullName, user_code: userCode, password, is_admin: isAdmin });
      if (res.error !== null) { setError(res.error); return; }
      setOk(`✓ User created. They can log in with User ID: ${res.data.user_code}`);
      // Refresh member list
      const updated = await listOrgMembers(selectedOrg);
      if (updated.error === null) setMembers(updated.data);
      setFullName(''); setUserCode(''); setPassword(''); setIsAdmin(false);
    });
  }

  if (orgs.length === 0) return null;

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Add user to organisation</h2>
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 24px' }}>
        Creates a user with a User ID and password — no email invite needed. They log in with their User ID directly.
      </p>

      <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        {/* Org picker */}
        <Field label="ORGANISATION">
          <select value={selectedOrg} onChange={e => handleOrgChange(e.target.value)} required style={{ ...input, appearance: 'none' }}>
            <option value="">Select an organisation…</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>

        {selectedOrg && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="FULL NAME">
                <input value={fullName} onChange={e => handleFullName(e.target.value)} placeholder="Amit Kumar" required style={input} />
              </Field>
              <Field label="USER ID" hint="Lowercase letters, numbers, dots, hyphens only — this is how they log in">
                <input value={userCode} onChange={e => setUserCode(e.target.value.toLowerCase())} placeholder="amit.kumar" required style={input} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="PASSWORD">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    style={{ ...input, paddingRight: 80 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer' }}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <Field label="ROLE">
                <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
                  {(['Member', 'Admin'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setIsAdmin(r === 'Admin')}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                        background: (r === 'Admin') === isAdmin ? '#fff' : '#1a1a1a',
                        color: (r === 'Admin') === isAdmin ? '#000' : '#666',
                        border: (r === 'Admin') === isAdmin ? '1px solid #fff' : '1px solid #333',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <ErrorBanner msg={error} />
            <SuccessBanner msg={ok} />

            <button type="submit" disabled={isPending} style={btnPrimary(isPending)}>
              {isPending ? 'Creating…' : 'Create user'}
            </button>
          </>
        )}
      </form>

      {/* Members list */}
      {selectedOrg && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#888', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Current members {loadingMembers ? '…' : `(${members.length})`}
          </h3>
          {members.length === 0 && !loadingMembers && (
            <p style={{ color: '#555', fontSize: 13 }}>No members yet.</p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '10px 14px' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>{m.full_name}</span>
                  {m.user_code && (
                    <span style={{ fontSize: 12, color: '#555', marginLeft: 10 }}>@{m.user_code}</span>
                  )}
                  {!m.user_code && (
                    <span style={{ fontSize: 12, color: '#555', marginLeft: 10 }}>{m.email}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.is_org_admin && <span style={chip(true)}>Admin</span>}
                  {!m.is_active && <span style={chip(false)}>Inactive</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Org list ────────────────────────────────────────────────────────────────
function OrgList({ orgs }: { orgs: Org[] }) {
  if (orgs.length === 0) return <p style={{ color: '#555', fontSize: 13 }}>No organisations yet.</p>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {orgs.map(org => (
        <div key={org.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export function PlatformClient({ initialOrgs }: Props) {
  const [orgs, setOrgs] = useState<Org[]>(initialOrgs);

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5', fontFamily: 'system-ui, sans-serif', padding: '40px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#444', textTransform: 'uppercase', marginBottom: 8 }}>
            Filio Platform Admin
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#fff' }}>Platform Dashboard</h1>
          <p style={{ color: '#666', marginTop: 6, fontSize: 14 }}>
            Create organisations and add team members without needing SQL or invite emails.
          </p>
        </div>

        <CreateOrgSection onCreated={org => setOrgs(prev => [...prev, org])} />
        <AddUserSection orgs={orgs} />

        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 14 }}>
            All organisations ({orgs.length})
          </h2>
          <OrgList orgs={orgs} />
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, History, User, Mail } from 'lucide-react';
import type { Profile, InternalFundContribution } from '../types';

interface UpdateInternalFundModalProps {
  eventId: string;
  creatorId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface MemberWithFunds {
  profile: Profile;
  contributions: InternalFundContribution[];
  totalAmount: number;
}

export const UpdateInternalFundModal: React.FC<UpdateInternalFundModalProps> = ({
  eventId,
  creatorId,
  onClose,
  onUpdate,
}) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // tracks member ID currently being updated
  const [errorMsg, setErrorMsg] = useState('');
  const [membersList, setMembersList] = useState<MemberWithFunds[]>([]);
  const [inputAmounts, setInputAmounts] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Fetch Creator profile
      const { data: creatorProfile, error: creatorErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', creatorId)
        .single();
      if (creatorErr) throw creatorErr;

      // 2. Fetch Joined members profiles
      const { data: membersRows, error: membersErr } = await supabase
        .from('event_members')
        .select('member_id, profiles:member_id(*)')
        .eq('event_id', eventId);
      if (membersErr) throw membersErr;

      const members: Profile[] = [];
      if (membersRows) {
        membersRows.forEach((row: any) => {
          if (row.profiles) {
            members.push(row.profiles as Profile);
          }
        });
      }

      // Combine Creator + Joined members (creator is listed first)
      const allProfiles = [creatorProfile as Profile, ...members];

      // 3. Fetch existing internal fund contributions
      const { data: contribs, error: contribsErr } = await supabase
        .from('internal_funds')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (contribsErr) throw contribsErr;

      const contributionsList = (contribs || []) as InternalFundContribution[];

      // 4. Map contributions to members
      const mappedList: MemberWithFunds[] = allProfiles.map((prof) => {
        const memberContribs = contributionsList.filter((c) => c.member_id === prof.id);
        const total = memberContribs.reduce((sum, c) => sum + Number(c.amount), 0);
        return {
          profile: prof,
          contributions: memberContribs,
          totalAmount: total,
        };
      });

      setMembersList(mappedList);
    } catch (err: any) {
      console.error('Error fetching internal fund details:', err);
      setErrorMsg(err.message || 'Failed to load members or fund history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [eventId, creatorId]);

  const handleAddFund = async (memberId: string) => {
    const amountStr = inputAmounts[memberId];
    if (!amountStr) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    setActionLoading(memberId);
    setErrorMsg('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user found.');

      const { error } = await supabase
        .from('internal_funds')
        .insert({
          event_id: eventId,
          member_id: memberId,
          amount: amount,
          added_by: user.id,
        });

      if (error) throw error;

      // Clear input field
      setInputAmounts((prev) => ({ ...prev, [memberId]: '' }));
      
      // Reload details and trigger parent update to refresh budget cards
      await fetchData();
      onUpdate();
    } catch (err: any) {
      console.error('Error adding internal fund contribution:', err);
      setErrorMsg(err.message || 'Failed to add internal fund contribution.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleInputChange = (memberId: string, val: string) => {
    setInputAmounts((prev) => ({ ...prev, [memberId]: val }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '650px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <h3>Manage Internal Funds</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Add internal funds for organization members. Each addition is recorded individually as a separate contribution history event.
        </p>

        {errorMsg && (
          <div style={{
            color: 'var(--color-danger)',
            fontSize: '0.85rem',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '0.65rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem'
          }}>
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
          </div>
        ) : (
          <div className="members-funds-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {membersList.map(({ profile, contributions, totalAmount }) => {
              const isCreatorProfile = profile.id === creatorId;
              const hasFunds = contributions.length > 0;

              return (
                <div key={profile.id} style={{
                  background: 'var(--bg-item)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  {/* Member Name and Email info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                        <User size={14} style={{ color: isCreatorProfile ? 'var(--color-primary)' : 'var(--text-muted)' }} />
                        {profile.full_name}
                        {isCreatorProfile && (
                          <span style={{
                            fontSize: '0.7rem',
                            background: 'rgba(255, 56, 92, 0.15)',
                            color: 'var(--color-primary)',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            Creator / Admin
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                        <Mail size={12} />
                        {profile.email}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Given</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '0.1rem' }}>
                        ₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Add Fund Form Section */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>₹</span>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder={hasFunds ? "Add extra fund amount" : "Enter initial fund amount"}
                        className="form-input"
                        style={{ paddingLeft: '1.75rem', paddingRight: '0.5rem', height: '36px', fontSize: '0.85rem' }}
                        value={inputAmounts[profile.id] || ''}
                        onChange={(e) => handleInputChange(profile.id, e.target.value)}
                        disabled={actionLoading !== null}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0 1rem', height: '36px', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      onClick={() => handleAddFund(profile.id)}
                      disabled={actionLoading !== null || !inputAmounts[profile.id]}
                    >
                      {actionLoading === profile.id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Plus size={14} />
                      )}
                      {hasFunds ? 'Add New Fund' : 'Add Fund'}
                    </button>
                  </div>

                  {/* Contribution History list */}
                  {hasFunds && (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem' }}>
                        <History size={12} /> Contribution History ({contributions.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '100px', overflowY: 'auto' }}>
                        {contributions.map((c) => (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-main)', background: 'rgba(255,255,255,0.02)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                            <span>₹{Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                              {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

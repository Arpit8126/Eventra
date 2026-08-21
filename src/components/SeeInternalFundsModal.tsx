import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, History, User, Mail } from 'lucide-react';
import type { Profile, InternalFundContribution } from '../types';

interface SeeInternalFundsModalProps {
  eventId: string;
  creatorId: string;
  onClose: () => void;
}

interface MemberWithFunds {
  profile: Profile;
  contributions: InternalFundContribution[];
  totalAmount: number;
}

export const SeeInternalFundsModal: React.FC<SeeInternalFundsModalProps> = ({
  eventId,
  creatorId,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [membersList, setMembersList] = useState<MemberWithFunds[]>([]);

  useEffect(() => {
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
        setErrorMsg(err.message || 'Failed to load internal funds.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [eventId, creatorId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <h3>Event Internal Funds</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Below are the internal fund contributions provided by each group member, recorded and maintained by the event admin.
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
          <div className="members-funds-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.25rem' }}>
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
                  gap: '0.5rem'
                }}>
                  {/* Member info */}
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

                  {/* Contribution history */}
                  {hasFunds ? (
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
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                      No internal funds recorded by admin yet.
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

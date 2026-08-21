import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, History, Mail, ArrowLeft, TrendingUp } from 'lucide-react';
import type { Profile, InternalFundContribution } from '../types';

interface InternalFundsTabProps {
  eventId: string;
  creatorId: string;
  isCreator: boolean;
  onClose: () => void;
}

interface MemberWithFunds {
  profile: Profile;
  contributions: InternalFundContribution[];
  totalAmount: number;
}

export const InternalFundsTab: React.FC<InternalFundsTabProps> = ({
  eventId,
  creatorId,
  isCreator,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [membersList, setMembersList] = useState<MemberWithFunds[]>([]);
  const [inputAmounts, setInputAmounts] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');

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

      // Combine Creator + Joined members
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

      setInputAmounts((prev) => ({ ...prev, [memberId]: '' }));
      await fetchData();
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

  const filteredMembersList = membersList.filter(({ profile }) => {
    const term = searchQuery.toLowerCase();
    return (
      profile.full_name.toLowerCase().includes(term) ||
      profile.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="internal-funds-page" style={{ padding: '1.5rem 1rem 5rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button 
          className="back-btn" 
          onClick={onClose} 
          title="Back to Event Details"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: '50%', padding: '0.6rem', cursor: 'pointer' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={22} style={{ color: 'var(--color-primary)' }} />
            Event Internal Funds
          </h2>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {isCreator 
              ? 'Manage and add internal resources collected from members. Each contribution is tracked as a separate history event.' 
              : 'View internal resources contributed by members and creator.'
            }
          </p>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: '0.85rem', paddingLeft: '1rem', height: '38px' }}
          />
        </div>
      </div>

      {errorMsg && (
        <div style={{
          color: 'var(--color-danger)',
          fontSize: '0.85rem',
          background: 'rgba(239, 68, 68, 0.1)',
          padding: '0.75rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem'
        }}>
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '250px', gap: '1rem' }}>
          <Loader2 className="animate-spin" size={40} style={{ color: 'var(--color-primary)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Retrieving internal funds...</p>
        </div>
      ) : filteredMembersList.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '250px',
          background: 'var(--bg-item)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '3rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted)'
        }}>
          No members found matching your search.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {filteredMembersList.map(({ profile, contributions, totalAmount }) => {
            const isCreatorProfile = profile.id === creatorId;
            const hasFunds = contributions.length > 0;

            return (
              <div 
                key={profile.id} 
                className="member-fund-row"
                style={{
                  background: 'var(--bg-item)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)'
                }}
              >
                {/* Top Info Layout */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: isCreatorProfile ? 'rgba(255, 56, 92, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      color: isCreatorProfile ? 'var(--color-primary)' : 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.1rem'
                    }}>
                      {profile.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                        {profile.full_name}
                        {isCreatorProfile && (
                          <span style={{
                            fontSize: '0.65rem',
                            background: 'rgba(255, 56, 92, 0.15)',
                            color: 'var(--color-primary)',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '50px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            Creator / Admin
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                        <Mail size={13} />
                        {profile.email}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Internal Fund</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.1rem' }}>
                      ₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Contribution Action (Only visible to Creator) */}
                {isCreator && (
                  <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px dashed var(--border-color)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                      <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>₹</span>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder={hasFunds ? "Enter extra fund amount" : "Enter initial fund amount"}
                        className="form-input"
                        style={{ paddingLeft: '1.85rem', height: '40px', fontSize: '0.9rem' }}
                        value={inputAmounts[profile.id] || ''}
                        onChange={(e) => handleInputChange(profile.id, e.target.value)}
                        disabled={actionLoading !== null}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0 1.25rem', height: '40px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                      onClick={() => handleAddFund(profile.id)}
                      disabled={actionLoading !== null || !inputAmounts[profile.id]}
                    >
                      {actionLoading === profile.id ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <Plus size={15} />
                      )}
                      {hasFunds ? 'Add New Fund' : 'Add Fund'}
                    </button>
                  </div>
                )}

                {/* History details */}
                {hasFunds ? (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      <History size={13} /> Contribution History ({contributions.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
                      {contributions.map((c) => (
                        <div 
                          key={c.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            fontSize: '0.8rem', 
                            color: 'var(--text-main)', 
                            background: 'rgba(255,255,255,0.02)', 
                            border: '1px solid var(--border-color)', 
                            padding: '0.5rem 0.75rem', 
                            borderRadius: '6px' 
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>₹{Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No internal funds contribution recorded yet.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

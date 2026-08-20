import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { Search, X, Loader2, Check, Users } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import type { DialogVariant } from './ConfirmDialog';

interface AddMembersModalProps {
  eventId: string;
  isCreator: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddMembersModal: React.FC<AddMembersModalProps> = ({ eventId, isCreator, onClose, onSuccess }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Current Members state
  const [currentMembers, setCurrentMembers] = useState<Profile[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: DialogVariant;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    variant: 'danger',
    onConfirm: () => {},
  });

  const fetchCurrentMembers = async () => {
    setMembersLoading(true);
    try {
      const { data: memberRows, error: memberErr } = await supabase
        .from('event_members')
        .select('member_id')
        .eq('event_id', eventId);

      if (memberErr) throw memberErr;

      const memberIds = (memberRows || []).map((row) => row.member_id);
      if (memberIds.length === 0) {
        setCurrentMembers([]);
        return;
      }

      const { data: profilesData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', memberIds);

      if (profileErr) throw profileErr;
      setCurrentMembers(profilesData || []);
    } catch (err) {
      console.error('Error fetching current members:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentMembers();
  }, [eventId]);

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchLoading(true);
      setErrorMsg('');
      try {
        const { data, error } = await supabase.rpc('search_members', {
          search_query: searchQuery,
          current_event_id: eventId,
        });

        if (error) throw error;
        
        // Filter out users already in our temporary selection list or already current members
        const filteredSuggestions = (data || []).filter(
          (s: Profile) => 
            !selectedMembers.some(sel => sel.id === s.id) &&
            !currentMembers.some(cur => cur.id === s.id)
        );

        setSuggestions(filteredSuggestions);
      } catch (err: any) {
        console.error('Error searching members:', err);
        setErrorMsg('Error searching for members.');
      } finally {
        setSearchLoading(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, eventId, selectedMembers, currentMembers]);

  const handleSelectUser = (user: Profile) => {
    if (!selectedMembers.some((m) => m.id === user.id)) {
      setSelectedMembers([...selectedMembers, user]);
    }
    setSearchQuery('');
    setSuggestions([]);
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedMembers(selectedMembers.filter((m) => m.id !== userId));
  };

  const handleAddMembersSubmit = async () => {
    if (selectedMembers.length === 0) return;

    setSubmitting(true);
    setErrorMsg('');

    try {
      const insertRows = selectedMembers.map((member) => ({
        event_id: eventId,
        member_id: member.id,
      }));

      const { error } = await supabase
        .from('event_members')
        .insert(insertRows);

      if (error) throw error;

      setSelectedMembers([]);
      fetchCurrentMembers();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add members.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMemberClick = (member: Profile) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Member',
      message: `Are you sure you want to remove "${member.full_name}" from this event? This action will prevent them from accessing event logs and analytics.`,
      confirmLabel: 'Remove Member',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          const { error } = await supabase
            .from('event_members')
            .delete()
            .eq('event_id', eventId)
            .eq('member_id', member.id);

          if (error) throw error;
          
          fetchCurrentMembers();
          onSuccess();
        } catch (err: any) {
          setErrorMsg(err.message || 'Failed to remove member.');
        }
      }
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', padding: '1.75rem 1.25rem', gap: '1.25rem', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title-row" style={{ marginBottom: 0 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Users size={20} style={{ color: 'var(--color-primary)' }} /> Add/Remove Members
          </h3>
          <button className="modal-close" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
          Manage event access. Verified users added as members can view the event dashboard, access budget ledger reports, log transactions, and view analytics.
        </p>

        {errorMsg && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', margin: 0 }}>
            {errorMsg}
          </div>
        )}

        {/* Current Members Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Current Members ({currentMembers.length})
          </span>
          {membersLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
              <Loader2 className="animate-spin" size={14} /> Loading members list...
            </div>
          ) : currentMembers.length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.25rem 0' }}>No members in this event yet.</span>
          ) : (
            <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '140px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {currentMembers.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.full_name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.email}</span>
                  </div>
                  {isCreator && (
                    <button
                      type="button"
                      style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.78rem',
                        height: 'auto',
                        background: 'var(--color-danger)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '100px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.9';
                        e.currentTarget.style.transform = 'scale(1.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onClick={() => handleRemoveMemberClick(m)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Members Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          {/* Selected Members Chips to be added */}
          {selectedMembers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>To Be Added ({selectedMembers.length}):</span>
              <div className="selected-members-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {selectedMembers.map((m) => (
                  <div key={m.id} className="member-chip" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-item)', border: '1px solid var(--border-color)', padding: '0.25rem 0.5rem', borderRadius: '100px', fontSize: '0.75rem' }}>
                    <span>{m.full_name}</span>
                    <button type="button" className="remove-chip-btn" onClick={() => handleRemoveUser(m.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-danger)' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Input Bar */}
          <div className="form-group" style={{ position: 'relative', margin: 0 }}>
            <label className="form-label" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Search Name or Email to Add</label>
            <div className="input-wrapper">
              <Search size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Type member name or email address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={submitting}
              />
              {searchLoading && (
                <Loader2 className="animate-spin" size={16} style={{ position: 'absolute', right: '1rem', color: 'var(--color-primary)' }} />
              )}
            </div>

            {/* Suggestions Panel */}
            {suggestions.length > 0 && (
              <div className="suggestions-list custom-scrollbar" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', maxHeight: '180px', overflowY: 'auto', marginTop: '0.25rem', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                {suggestions.map((user) => (
                  <div key={user.id} className="suggestion-item" onClick={() => handleSelectUser(user)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span className="suggestion-name" style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>{user.full_name}</span>
                      <span className="suggestion-email" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</span>
                    </div>
                    <Check size={14} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
                  </div>
                ))}
              </div>
            )}

            {searchQuery.trim() && !searchLoading && suggestions.length === 0 && (
              <div style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginTop: '0.5rem' }}>
                No verified users found matching your search.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Close
          </button>
          {selectedMembers.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddMembersSubmit}
              disabled={submitting}
            >
              {submitting ? 'Adding...' : `Add Selected (${selectedMembers.length})`}
            </button>
          )}
        </div>
      </div>

      {confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel="Cancel"
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
};

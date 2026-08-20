import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Event } from '../types';
import { Plus, Calendar, Shield, Users, LogOut, Loader2, ArrowRight, Sun, Moon, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog, Toast } from './ConfirmDialog';
import type { DialogVariant } from './ConfirmDialog';

interface DashboardProps {
  userId: string;
  userName: string;
  userEmail: string;
  onSelectEvent: (event: Event, isCreator: boolean) => void;
  onLogout: () => void;
  logoutLoading?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  userId,
  userName,
  userEmail,
  onSelectEvent,
  onLogout,
  logoutLoading = false,
  theme,
  onToggleTheme,
}) => {
  const [createdEvents, setCreatedEvents] = useState<Event[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Mobile layout tab switcher state
  const [mobileTab, setMobileTab] = useState<'your' | 'joined'>('your');

  // Computed financial aggregates maps per event
  const [eventExpenses, setEventExpenses] = useState<Record<string, number>>({});
  const [eventIncome, setEventIncome] = useState<Record<string, number>>({});

  // Themed confirm dialog state
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
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null);

  // Edit Event States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const closeConfirm = useCallback(() => setConfirmDialog(d => ({ ...d, isOpen: false })), []);
  const showToast = useCallback((message: string, variant: 'error' | 'success' | 'info' = 'error') => {
    setToast({ message, variant });
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      // 1. Fetch events created by current user
      const { data: created, error: createdErr } = await supabase
        .from('events')
        .select('*')
        .eq('creator_id', userId)
        .order('created_at', { ascending: true });

      if (createdErr) throw createdErr;
      const parsedCreated = created || [];
      setCreatedEvents(parsedCreated);

      // 2. Fetch events joined by user (via event_members)
      const { data: joined, error: joinedErr } = await supabase
        .from('event_members')
        .select('events(*)')
        .eq('member_id', userId);

      if (joinedErr) throw joinedErr;

      // Extract events from nested select (filtering out any null joins)
      const parsedJoined: Event[] = (joined || [])
        .map((m: any) => m.events)
        .filter((e): e is Event => e !== null)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setJoinedEvents(parsedJoined);

      // 3. Compute financial aggregates for all visible event IDs
      const eventIds = [...parsedCreated.map((e) => e.id), ...parsedJoined.map((e) => e.id)];
      if (eventIds.length > 0) {
        const [expensesRes, incomeRes] = await Promise.all([
          supabase.from('expenses').select('event_id, amount').in('event_id', eventIds),
          supabase.from('income').select('event_id, amount').in('event_id', eventIds),
        ]);

        const expMap: Record<string, number> = {};
        const incMap: Record<string, number> = {};

        (expensesRes.data || []).forEach((item) => {
          expMap[item.event_id] = (expMap[item.event_id] || 0) + item.amount;
        });

        (incomeRes.data || []).forEach((item) => {
          incMap[item.event_id] = (incMap[item.event_id] || 0) + item.amount;
        });

        setEventExpenses(expMap);
        setEventIncome(incMap);
      }
    } catch (err: any) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [userId]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;

    setCreateLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('events')
        .insert({
          name: newEventName.trim(),
          creator_id: userId,
          internal_fund: 0,
        });

      if (error) throw error;

      setNewEventName('');
      setShowCreateModal(false);
      fetchEvents(); // Reload lists
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create event.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteEvent = (eventId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Event',
      message: `Permanently delete "${name}"? All data, incomes, expenses, and logs will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete Event',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) throw error;
          fetchEvents();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete event.');
        }
      },
    });
  };

  const handleLeaveEvent = (eventId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Leave Event',
      message: `Leave "${name}"? You will lose access and will need a new invite to rejoin.`,
      confirmLabel: 'Leave Event',
      variant: 'warning',
      onConfirm: async () => {
        closeConfirm();
        try {
          const { error } = await supabase
            .from('event_members')
            .delete()
            .eq('event_id', eventId)
            .eq('member_id', userId);
          if (error) throw error;
          fetchEvents();
        } catch (err: any) {
          showToast(err.message || 'Failed to leave event.');
        }
      },
    });
  };

  const openEditModal = (eventId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEventId(eventId);
    setEditName(name);
    setShowEditModal(true);
    setErrorMsg('');
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editingEventId) return;

    setCreateLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('events')
        .update({ name: editName.trim() })
        .eq('id', editingEventId);

      if (error) throw error;

      setShowEditModal(false);
      setEditingEventId(null);
      fetchEvents(); // Reload lists
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update event.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        <div className="logo-group">
          <Calendar size={28} style={{ color: 'var(--color-primary)' }} />
          <span>Eventra</span>
        </div>
        <div className="user-nav-actions">
          {/* Theme Toggler Button */}
          <button 
            className="back-btn" 
            onClick={onToggleTheme} 
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <div className="user-badge">
            <div className="user-avatar">
              {userName ? userName.charAt(0).toUpperCase() : userEmail.charAt(0).toUpperCase()}
            </div>
            <span className="user-name">{userName || userEmail}</span>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={onLogout} 
            disabled={logoutLoading}
            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {logoutLoading ? (
              <Loader2 className="animate-spin" size={16} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <LogOut size={16} />
            )}
            <span className="logout-text">{logoutLoading ? 'Logging out...' : 'Logout'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
          <Loader2 className="animate-spin" size={40} style={{ color: 'var(--color-primary)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading your dashboard...</p>
        </div>
      ) : (
        <>
          {/* Universal Tab Switcher for both Desktop & Mobile */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div className="tab-nav" style={{ margin: 0 }}>
              <button
                className={`tab-btn ${mobileTab === 'your' ? 'active' : ''}`}
                onClick={() => setMobileTab('your')}
              >
                Your Events ({createdEvents.length})
              </button>
              <button
                className={`tab-btn ${mobileTab === 'joined' ? 'active' : ''}`}
                onClick={() => setMobileTab('joined')}
              >
                Joined Events ({joinedEvents.length})
              </button>
            </div>
            
            {/* Desktop Create Button sits nicely inline next to tabs */}
            {mobileTab === 'your' && (
              <button className="btn btn-primary desktop-only" onClick={() => setShowCreateModal(true)} style={{ padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <Plus size={16} /> Create Event
              </button>
            )}
          </div>

          {/* Unified Card layout showing only one selected list at a time */}
          <div className="dashboard-sections" style={{ gridTemplateColumns: '1fr' }}>
            <div className="section-card mobile-visible" style={{ minHeight: 'calc(100vh - 220px)', display: 'flex', flexDirection: 'column' }}>
              <div className="section-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
                <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                  {mobileTab === 'your' ? (
                    <>
                      <Shield size={20} style={{ color: 'var(--color-primary)' }} /> Created Event Registers
                    </>
                  ) : (
                    <>
                      <Users size={20} style={{ color: 'var(--color-accent)' }} /> Joined Financial Portals
                    </>
                  )}
                </h2>
              </div>

              <div className="event-list" style={{ flex: 1 }}>
                {mobileTab === 'your' ? (
                  createdEvents.length === 0 ? (
                    <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ marginBottom: '1.25rem' }}>You haven't created any events yet.</p>
                      <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                        Create Your First Event
                      </button>
                    </div>
                  ) : (
                    createdEvents.map((event, index) => {
                      const totalExpenses = eventExpenses[event.id] || 0;
                      const totalIncome = eventIncome[event.id] || 0;
                      const totalFunds = event.internal_fund + totalIncome;
                      const remainingFunds = totalFunds - totalExpenses;

                      return (
                        <div key={event.id} className="event-item" onClick={() => onSelectEvent(event, true)}>
                          <div className="event-info" style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <span className="event-number">{index + 1}</span>
                            <span className="event-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</span>
                          </div>

                          {/* Desktop Inline Financial Columns */}
                          <div className="event-row-stats desktop-only" style={{ display: 'flex', gap: '2rem', marginRight: '2rem', flexShrink: 0 }}>
                            <div className="row-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Funds</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                                ₹{totalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="row-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Expenses</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-danger)', marginTop: '0.1rem' }}>
                                ₹{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="row-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Remaining</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: remainingFunds >= 0 ? 'var(--color-success)' : 'var(--color-danger)', marginTop: '0.1rem' }}>
                                {remainingFunds < 0 ? '-' : ''}₹{Math.abs(remainingFunds).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <div className="event-actions-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                            {/* Desktop text buttons */}
                            <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={(e) => openEditModal(event.id, event.name, e)}
                                style={{
                                  padding: '0.35rem 0.85rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '100px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-item)',
                                  color: 'var(--text-main)',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn"
                                onClick={(e) => handleDeleteEvent(event.id, event.name, e)}
                                style={{
                                  padding: '0.35rem 0.85rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '100px',
                                  border: 'none',
                                  background: 'var(--color-primary)',
                                  color: '#ffffff',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 4px 12px rgba(255, 56, 92, 0.25)',
                                }}
                              >
                                Delete
                              </button>
                            </div>

                            {/* Mobile icons */}
                            <div className="mobile-only" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                onClick={(e) => openEditModal(event.id, event.name, e)}
                                style={{
                                  background: 'var(--bg-item)',
                                  borderRadius: '50%',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-main)',
                                  cursor: 'pointer',
                                  padding: '0.45rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteEvent(event.id, event.name, e)}
                                style={{
                                  background: 'var(--color-primary)',
                                  borderRadius: '50%',
                                  border: 'none',
                                  color: '#ffffff',
                                  cursor: 'pointer',
                                  padding: '0.45rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 4px 12px rgba(255, 56, 92, 0.25)',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <ArrowRight size={16} className="desktop-only" style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }} />
                          </div>
                        </div>
                      );
                    })
                  )
                ) : (
                  joinedEvents.length === 0 ? (
                    <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ marginBottom: '0.5rem' }}>You haven't joined any events as a member yet.</p>
                      <p style={{ fontSize: '0.8rem' }}>Ask event creators to add you by your registered email address!</p>
                    </div>
                  ) : (
                    joinedEvents.map((event, index) => {
                      const totalExpenses = eventExpenses[event.id] || 0;
                      const totalIncome = eventIncome[event.id] || 0;
                      const totalFunds = event.internal_fund + totalIncome;
                      const remainingFunds = totalFunds - totalExpenses;

                      return (
                        <div key={event.id} className="event-item" onClick={() => onSelectEvent(event, false)}>
                          <div className="event-info" style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <span className="event-number">{index + 1}</span>
                            <span className="event-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</span>
                          </div>

                          {/* Desktop Inline Financial Columns */}
                          <div className="event-row-stats desktop-only" style={{ display: 'flex', gap: '2rem', marginRight: '2rem', flexShrink: 0 }}>
                            <div className="row-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Funds</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                                ₹{totalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="row-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Expenses</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-danger)', marginTop: '0.1rem' }}>
                                ₹{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="row-stat-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '95px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Remaining</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: remainingFunds >= 0 ? 'var(--color-success)' : 'var(--color-danger)', marginTop: '0.1rem' }}>
                                {remainingFunds < 0 ? '-' : ''}₹{Math.abs(remainingFunds).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <div className="event-actions-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                            {/* Desktop text button */}
                            <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                className="btn"
                                onClick={(e) => handleLeaveEvent(event.id, event.name, e)}
                                style={{
                                  padding: '0.35rem 0.85rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '100px',
                                  border: 'none',
                                  background: 'var(--color-primary)',
                                  color: '#ffffff',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 4px 12px rgba(255, 56, 92, 0.25)',
                                }}
                              >
                                Remove
                              </button>
                            </div>

                            {/* Mobile icon */}
                            <div className="mobile-only" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                onClick={(e) => handleLeaveEvent(event.id, event.name, e)}
                                style={{
                                  background: 'var(--color-primary)',
                                  borderRadius: '50%',
                                  border: 'none',
                                  color: '#ffffff',
                                  cursor: 'pointer',
                                  padding: '0.45rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 4px 12px rgba(255, 56, 92, 0.25)',
                                }}
                              >
                                <LogOut size={13} style={{ transform: 'rotate(180deg)' }} />
                              </button>
                            </div>

                            <ArrowRight size={16} className="desktop-only" style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }} />
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>
          </div>

          {/* Floating Plus Button for Mobile View */}
          <button className="mobile-fab" onClick={() => setShowCreateModal(true)}>
            <Plus size={24} />
          </button>
        </>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Create New Event</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            {errorMsg && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Event Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Goa Trip 2026"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 10px)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createLoading || !newEventName.trim()}
                  style={{
                    borderRadius: 'var(--radius-md, 10px)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: !createLoading && newEventName.trim() ? '0 4px 14px rgba(255, 56, 92, 0.35)' : 'none'
                  }}
                >
                  {createLoading ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline styles for fab & mobile switcher toggling */}
      <style>{`
        .mobile-only {
          display: none !important;
        }
        .mobile-fab {
          display: none;
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
          color: #FFF;
          border: none;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 50;
          transition: transform 0.2s ease;
        }
        .mobile-fab:hover {
          transform: scale(1.1);
        }
        
        @media (max-width: 1024px) {
          .desktop-only {
            display: none !important;
          }
          .mobile-view-actions {
            display: block !important;
          }
          .mobile-fab {
            display: flex !important;
          }
          .mobile-hidden {
            display: none !important;
          }
          .mobile-visible {
            display: flex !important;
          }
          .mobile-only {
            display: flex !important;
          }
        }
      `}</style>

      {/* Edit Event Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-title-row">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.25rem', color: 'var(--text-main)', fontWeight: 700 }}>
                Rename Event Register
              </h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleUpdateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
              {errorMsg && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  {errorMsg}
                </div>
              )}
              
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Event Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Goa Trip 2026"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={createLoading}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                  style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 10px)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createLoading || !editName.trim()}
                  style={{
                    borderRadius: 'var(--radius-md, 10px)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: !createLoading && editName.trim() ? '0 4px 14px rgba(255, 56, 92, 0.35)' : 'none'
                  }}
                >
                  {createLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Themed Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Toast Error/Success Notification */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

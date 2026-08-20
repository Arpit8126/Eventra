import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Event, Expense, Income, Profile } from '../types';
import { ExpensesTab } from './ExpensesTab';
import { IncomeTab } from './IncomeTab';
import { UpdateInternalFundModal } from './UpdateInternalFundModal';
import { AddMembersModal } from './AddMembersModal';
import { LogsModal } from './LogsModal';
import { AnalyticsModal } from './AnalyticsModal';
import { ConfirmDialog, Toast } from './ConfirmDialog';
import type { DialogVariant } from './ConfirmDialog';
import { ArrowLeft, MoreVertical, Users, BarChart2, FileText, Settings, Trash2, Edit2, LogOut, Loader2, Sun, Moon } from 'lucide-react';

interface EventDetailsProps {
  event: Event;
  isCreator: boolean;
  currentUserId: string;
  onBack: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const EventDetails: React.FC<EventDetailsProps> = ({
  event: initialEvent,
  isCreator,
  currentUserId,
  onBack,
  theme,
  onToggleTheme,
}) => {
  const [event, setEvent] = useState<Event>(initialEvent);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  // Tab views: 'expenses' or 'income'
  const [activeTab, setActiveTab] = useState<'expenses' | 'income'>('expenses');

  // Menu and Modals state
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState(event.name);
  const [renameLoading, setRenameLoading] = useState(false);

  const [showInternalFundModal, setShowInternalFundModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  // Themed confirm dialog + toast state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: DialogVariant;
    onConfirm: () => void;
  }>({
    isOpen: false, title: '', message: '', confirmLabel: 'Confirm', variant: 'danger', onConfirm: () => {},
  });
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null);
  const closeConfirm = useCallback(() => setConfirmDialog(d => ({ ...d, isOpen: false })), []);
  const showToast = useCallback((msg: string, variant: 'error' | 'success' | 'info' = 'error') => setToast({ message: msg, variant }), []);

  useEffect(() => {
    const handleHash = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const isLogsPage = currentHash.endsWith('/logs');
  const isAnalyticsPage = currentHash.endsWith('/analytics');

  // Click-away to close three-dot menu dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const fetchBudgetAndRecords = async () => {
    setLoading(true);
    try {
      // 1. Fetch updated event data (internal fund & name)
      const { data: eventData, error: eventErr } = await supabase
        .from('events')
        .select('*')
        .eq('id', event.id)
        .single();
      if (eventErr) throw eventErr;
      setEvent(eventData);

      // 2. Fetch expenses
      const { data: expensesData, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('event_id', event.id)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (expErr) throw expErr;
      setExpenses(expensesData || []);

      // 3. Fetch income
      const { data: incomeData, error: incErr } = await supabase
        .from('income')
        .select('*')
        .eq('event_id', event.id)
        .order('income_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (incErr) throw incErr;
      setIncome(incomeData || []);

      // 4. Fetch profiles to map user names and emails
      const { data: profilesData, error: profErr } = await supabase
        .from('profiles')
        .select('*');
      if (profErr) throw profErr;

      const profileMap: Record<string, Profile> = {};
      (profilesData || []).forEach((p) => {
        profileMap[p.id] = p;
      });
      setProfiles(profileMap);
    } catch (err: any) {
      console.error('Error fetching event data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgetAndRecords();
  }, [event.id]);

  // Calculations
  const totalIncomesSum = income.reduce((sum, inc) => sum + Number(inc.amount), 0);
  const totalExpensesSum = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const totalFund = event.internal_fund + totalIncomesSum;
  const availableFund = totalFund - totalExpensesSum;

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || renameValue.trim() === event.name) return;

    setRenameLoading(true);
    try {
      const { error } = await supabase
        .from('events')
        .update({ name: renameValue.trim() })
        .eq('id', event.id);

      if (error) throw error;
      setEvent({ ...event, name: renameValue.trim() });
      setShowRenameModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to rename event.');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDeleteEvent = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Event',
      message: 'Permanently delete this event? All data, incomes, expenses, and logs will be deleted. This cannot be undone.',
      confirmLabel: 'Delete Event',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          const { error } = await supabase.from('events').delete().eq('id', event.id);
          if (error) throw error;
          onBack();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete event.');
        }
      },
    });
  };

  const handleLeaveEvent = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Leave Event',
      message: 'Leave this event? You will lose access and will need a new invite to rejoin.',
      confirmLabel: 'Leave Event',
      variant: 'warning',
      onConfirm: async () => {
        closeConfirm();
        try {
          const { error } = await supabase
            .from('event_members')
            .delete()
            .eq('event_id', event.id)
            .eq('member_id', currentUserId);
          if (error) throw error;
          onBack();
        } catch (err: any) {
          showToast(err.message || 'Failed to leave event.');
        }
      },
    });
  };

  return (
    <div className="app-container">
      {/* Event Header View */}
      <div className="event-header-flat event-hub-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="header-top">
            <button className="back-btn" onClick={isLogsPage || isAnalyticsPage ? () => { window.location.hash = `#/event/${event.id}`; } : onBack} title={isLogsPage || isAnalyticsPage ? "Back to Event Details" : "Back to Events"}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="event-title-text" style={{ fontFamily: 'Outfit', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                {event.name}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {/* Theme Toggler Button */}
            <button 
              className="back-btn" 
              onClick={onToggleTheme} 
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {/* Three Dot Action Dropdown Menu */}
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button className="back-btn" onClick={() => setShowMenu(!showMenu)} title="Event Options">
                <MoreVertical size={18} />
              </button>

              {showMenu && (
                <div className="dropdown-menu">
                  {isCreator ? (
                    <>
                      <button onClick={() => { setShowMenu(false); setRenameValue(event.name); setShowRenameModal(true); }}>
                        <Edit2 size={14} /> Rename Event
                      </button>
                      <button onClick={() => { setShowMenu(false); setShowInternalFundModal(true); }}>
                        <Settings size={14} /> Update Internal Fund
                      </button>
                      <button onClick={() => { setShowMenu(false); setShowAddMembersModal(true); }}>
                        <Users size={14} /> Add/Remove Members
                      </button>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/logs`; }}>
                        <FileText size={14} /> See Logs
                      </button>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/analytics`; }}>
                        <BarChart2 size={14} /> Analytics
                      </button>
                      <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.25rem 0' }}></div>
                      <button onClick={() => { setShowMenu(false); handleDeleteEvent(); }} className="danger-action">
                        <Trash2 size={14} /> Delete Event
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/logs`; }}>
                        <FileText size={14} /> See Logs
                      </button>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/analytics`; }}>
                        <BarChart2 size={14} /> See Analytics
                      </button>
                      <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.25rem 0' }}></div>
                      <button onClick={() => { setShowMenu(false); handleLeaveEvent(); }} className="danger-action">
                        <LogOut size={14} /> Leave Event
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial Stat Cards (Dynamic calculation displays) - Hide on logs/analytics routes */}
        {!isLogsPage && !isAnalyticsPage && (
          <div className="event-stats-grid">
            <div className="stat-card">
              <span className="stat-label">Internal Fund</span>
              <div className="stat-value" style={{ color: 'var(--text-main)' }}>
                ₹{event.internal_fund.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="stat-card total-fund">
              <span className="stat-label">Total Fund</span>
              <div className="stat-value">
                ₹{totalFund.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="stat-card total-expenses">
              <span className="stat-label">Total Expenses</span>
              <div className="stat-value">
                ₹{totalExpensesSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="stat-card available-fund">
              <span className="stat-label">Available Fund</span>
              <div className={`stat-value ${availableFund >= 0 ? 'positive' : 'negative'}`}>
                {availableFund < 0 ? '-' : ''}₹{Math.abs(availableFund).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Budget Navigation Tabs & List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
          <Loader2 className="animate-spin" size={40} style={{ color: 'var(--color-primary)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Updating financial ledger...</p>
        </div>
      ) : isLogsPage ? (
        <LogsModal
          eventId={event.id}
          onClose={() => { window.location.hash = `#/event/${event.id}`; }}
          isFullPage={true}
        />
      ) : isAnalyticsPage ? (
        <AnalyticsModal
          expenses={expenses}
          income={income}
          onClose={() => { window.location.hash = `#/event/${event.id}`; }}
          isFullPage={true}
        />
      ) : (
        <div className="event-content-section">
          {/* Tab Switcher */}
          <div className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              Expenses Ledgers ({expenses.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'income' ? 'active' : ''}`}
              onClick={() => setActiveTab('income')}
            >
              Income ({income.length})
            </button>
          </div>

          {/* Sub Panels */}
          {activeTab === 'expenses' ? (
            <ExpensesTab
              eventId={event.id}
              currentUserId={currentUserId}
              isCreator={isCreator}
              profiles={profiles}
              expenses={expenses}
              onRefresh={fetchBudgetAndRecords}
            />
          ) : (
            <IncomeTab
              eventId={event.id}
              currentUserId={currentUserId}
              isCreator={isCreator}
              profiles={profiles}
              income={income}
              onRefresh={fetchBudgetAndRecords}
            />
          )}
        </div>
      )}

      {/* ==========================================
         MODALS POPUPS
         ========================================== */}

      {/* Rename Event Modal */}
      {showRenameModal && (
        <div className="modal-overlay" onClick={() => setShowRenameModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Rename Event</h3>
              <button className="modal-close" onClick={() => setShowRenameModal(false)}>✕</button>
            </div>

            <form onSubmit={handleRenameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Event Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={renameLoading || !renameValue.trim() || renameValue.trim() === event.name}>
                  {renameLoading ? 'Renaming...' : 'Rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Internal Fund Modal */}
      {showInternalFundModal && (
        <UpdateInternalFundModal
          eventId={event.id}
          currentFund={event.internal_fund}
          onClose={() => setShowInternalFundModal(false)}
          onUpdate={fetchBudgetAndRecords}
        />
      )}

      {/* Add Members Modal */}
      {showAddMembersModal && (
        <AddMembersModal
          eventId={event.id}
          isCreator={isCreator}
          onClose={() => setShowAddMembersModal(false)}
          onSuccess={fetchBudgetAndRecords}
        />
      )}



      <style>{`
        /* Three dot actions dropdown */
        .dropdown-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          background: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          width: 200px;
          display: flex;
          flex-direction: column;
          padding: 0.4rem;
          z-index: 90;
          animation: modalScale 0.15s ease-out;
        }
        
        .dropdown-menu button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.6rem 0.8rem;
          border: none;
          background: transparent;
          color: var(--text-main);
          font-size: 0.85rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.15s ease;
        }
        
        .dropdown-menu button:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        
        .dropdown-menu button.danger-action {
          color: var(--color-danger);
        }
        
        .dropdown-menu button.danger-action:hover {
          background: rgba(239, 68, 68, 0.1);
        }
      `}</style>

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

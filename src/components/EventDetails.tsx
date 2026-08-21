import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Event, Expense, Income, Profile } from '../types';
import { ExpensesTab } from './ExpensesTab';
import { IncomeTab } from './IncomeTab';
import { InternalFundsTab } from './InternalFundsTab';
import { NotificationsTab } from './NotificationsTab';
import { AddMembersModal } from './AddMembersModal';
import { LogsModal } from './LogsModal';
import { AnalyticsModal } from './AnalyticsModal';
import { ConfirmDialog, Toast } from './ConfirmDialog';
import type { DialogVariant } from './ConfirmDialog';
import { ArrowLeft, MoreVertical, Users, BarChart2, FileText, Settings, Trash2, Edit2, LogOut, Loader2, Sun, Moon, Bell } from 'lucide-react';

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
  const isReportPage = currentHash.endsWith('/report');
  const isNotificationsPage = currentHash.endsWith('/notifications');
  const isInternalFundsPage = currentHash.endsWith('/internal-funds');

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

      // 4. Fetch only relevant profiles: event creator + all event members + current user
      //    Step 4a: get member IDs for this event
      const { data: membersData } = await supabase
        .from('event_members')
        .select('member_id')
        .eq('event_id', event.id);

      // Build unique set of IDs we actually need
      const relevantIds = Array.from(new Set([
        eventData.creator_id,
        currentUserId,
        ...(membersData || []).map((m: any) => m.member_id),
      ]));

      //    Step 4b: fetch only those profiles (targeted - not all users)
      const { data: profilesData, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', relevantIds);
      if (profErr) throw profErr;

      const profileMap: Record<string, Profile> = {};
      (profilesData || []).forEach((p) => {
        profileMap[p.id] = p;
      });
      setProfiles(profileMap);

      // Save/update the local backup cache for this event
      try {
        const backupData = {
          event: eventData,
          expenses: expensesData || [],
          income: incomeData || [],
          profiles: profileMap,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(`eventra_event_backup_${event.id}`, JSON.stringify(backupData));
      } catch (backupErr) {
        console.error('Failed to save event details local backup:', backupErr);
      }
    } catch (err: any) {
      console.error('Error fetching event data, trying local offline backup:', err);
      try {
        const cached = localStorage.getItem(`eventra_event_backup_${event.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setEvent(parsed.event);
          setExpenses(parsed.expenses || []);
          setIncome(parsed.income || []);
          setProfiles(parsed.profiles || {});

          const cacheDate = new Date(parsed.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          showToast(`Loaded offline backup from ${cacheDate}. You are currently offline.`, 'info');
        } else {
          showToast('Failed to load event details. No offline backup found.', 'error');
        }
      } catch (cacheErr) {
        console.error('Failed to parse event details local backup:', cacheErr);
      }
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

  const handleViewReport = () => {
    window.location.hash = `#/event/${event.id}/report`;
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
            <button className="back-btn" onClick={isLogsPage || isAnalyticsPage || isReportPage || isNotificationsPage || isInternalFundsPage ? () => { window.location.hash = `#/event/${event.id}`; } : onBack} title={isLogsPage || isAnalyticsPage || isReportPage || isNotificationsPage || isInternalFundsPage ? "Back to Event Details" : "Back to Events"}>
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
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/internal-funds`; }}>
                        <Settings size={14} /> Update Internal Funds
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
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/notifications`; }}>
                        <Bell size={14} /> See Notifications
                      </button>
                      <button onClick={() => { setShowMenu(false); handleViewReport(); }} className="desktop-only-action">
                        <FileText size={14} /> View Report
                      </button>
                      <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.25rem 0' }}></div>
                      <button onClick={() => { setShowMenu(false); handleDeleteEvent(); }} className="danger-action">
                        <Trash2 size={14} /> Delete Event
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/internal-funds`; }}>
                        <Settings size={14} /> See Internal Funds
                      </button>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/logs`; }}>
                        <FileText size={14} /> See Logs
                      </button>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/analytics`; }}>
                        <BarChart2 size={14} /> See Analytics
                      </button>
                      <button onClick={() => { setShowMenu(false); window.location.hash = `#/event/${event.id}/notifications`; }}>
                        <Bell size={14} /> See Notifications
                      </button>
                      <button onClick={() => { setShowMenu(false); handleViewReport(); }} className="desktop-only-action">
                        <FileText size={14} /> View Report
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
        {!isLogsPage && !isAnalyticsPage && !isReportPage && (
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
      ) : isNotificationsPage ? (
        <NotificationsTab
          eventId={event.id}
          onClose={() => { window.location.hash = `#/event/${event.id}`; }}
        />
      ) : isInternalFundsPage ? (
        <InternalFundsTab
          eventId={event.id}
          creatorId={event.creator_id}
          isCreator={isCreator}
          onClose={() => { window.location.hash = `#/event/${event.id}`; }}
        />
      ) : isReportPage ? (
        (() => {
          const totalInternalFunds = event.internal_fund;
          const totalExternalFunds = income.reduce((sum, inc) => sum + Number(inc.amount), 0);
          const totalFunds = totalInternalFunds + totalExternalFunds;
          const totalExpensesAmt = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
          const netRemaining = totalFunds - totalExpensesAmt;

          interface CombinedTx {
            type: 'expense' | 'income';
            id: string;
            dateObj: Date;
            description: string;
            amount: number;
            added_by: string;
            created_at: string;
            expense_date?: string;
            income_date?: string;
            purpose?: string;
            donor_name?: string;
          }

          const combinedList: CombinedTx[] = [
            ...expenses.map(exp => ({ type: 'expense' as const, id: exp.id, dateObj: new Date(exp.expense_date), description: exp.purpose, amount: Number(exp.amount), added_by: exp.added_by, created_at: exp.created_at, expense_date: exp.expense_date })),
            ...income.map(inc => ({ type: 'income' as const, id: inc.id, dateObj: new Date(inc.income_date), description: inc.donor_name, amount: Number(inc.amount), added_by: inc.added_by, created_at: inc.created_at, income_date: inc.income_date })),
          ];
          combinedList.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

          const chronologicalMonths: string[] = [];
          const monthlyGroups: Record<string, CombinedTx[]> = {};
          combinedList.forEach(tx => {
            const key = tx.dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            if (!monthlyGroups[key]) { monthlyGroups[key] = []; chronologicalMonths.push(key); }
            monthlyGroups[key].push(tx);
          });

          const sortedExpDesc = [...expenses].sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
          const sortedIncDesc = [...income].sort((a, b) => new Date(b.income_date).getTime() - new Date(a.income_date).getTime());

          const fmtDT = (iso: string) => {
            const d = new Date(iso);
            return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
          };

          return (
            <div className="rpt-container">
              <div className="rpt-sheet">
                <div className="rpt-header">
                  <div>
                    <h1 className="rpt-title">{event.name}</h1>
                    <p className="rpt-subtitle">Financial Statement &amp; Combined Monthly Accounts Ledger</p>
                  </div>
                  <div className="rpt-meta">Date Generated: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>

                <div className="rpt-summary-section">
                  <div className="rpt-section-label">Financial Summary Overview</div>
                  <div className="rpt-summary-grid">
                    {[
                      { label: 'Internal Funds', value: `₹${totalInternalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: '' },
                      { label: 'External Funds', value: `₹${totalExternalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: '' },
                      { label: 'Total Funds', value: `₹${totalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: '#10b981' },
                      { label: 'Total Expenses', value: `₹${totalExpensesAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: '#ef4444' },
                      { label: 'Net Balance', value: `₹${netRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: netRemaining >= 0 ? '#10b981' : '#ef4444' },
                    ].map(c => (
                      <div key={c.label} className="rpt-card">
                        <span className="rpt-card-label">{c.label}</span>
                        <span className="rpt-card-value" style={c.color ? { color: c.color } : {}}>{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rpt-section-title">Monthly Activity Ledger</div>
                {chronologicalMonths.length === 0 ? (
                  <div className="rpt-empty">No transaction records found.</div>
                ) : chronologicalMonths.map(monthName => {
                  const txs = monthlyGroups[monthName];
                  let mExp = 0; let mInc = 0;
                  return (
                    <div key={monthName} className="rpt-month-block">
                      <div className="rpt-month-name">{monthName}</div>
                      <table className="rpt-table">
                        <thead><tr>
                          <th style={{ width: '12%' }}>Date</th>
                          <th style={{ width: '40%' }}>Description</th>
                          <th style={{ textAlign: 'right', width: '15%' }}>Expense</th>
                          <th style={{ textAlign: 'right', width: '15%' }}>Income</th>
                          <th style={{ textAlign: 'right', width: '18%' }}>Net Change</th>
                        </tr></thead>
                        <tbody>
                          {txs.map(tx => {
                            const isExp = tx.type === 'expense';
                            if (isExp) mExp += tx.amount; else mInc += tx.amount;
                            const net = isExp ? -tx.amount : tx.amount;
                            const netStr = net >= 0 ? `₹+${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `₹-${Math.abs(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                            return (
                              <tr key={tx.id}>
                                <td>{tx.dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                                <td>{tx.description || '—'}</td>
                                <td style={{ textAlign: 'right', color: '#dc2626', whiteSpace: 'nowrap' }}>{isExp ? `₹${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '₹0.00'}</td>
                                <td style={{ textAlign: 'right', color: '#16a34a', whiteSpace: 'nowrap' }}>{!isExp ? `₹${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '₹0.00'}</td>
                                <td style={{ textAlign: 'right', color: net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>{netStr}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot><tr className="rpt-subtotal">
                          <td colSpan={2} style={{ textAlign: 'right' }}>Monthly Subtotals:</td>
                          <td style={{ textAlign: 'right', color: '#dc2626', whiteSpace: 'nowrap' }}>₹{mExp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right', color: '#16a34a', whiteSpace: 'nowrap' }}>₹{mInc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: (mInc - mExp) >= 0 ? '#10b981' : '#ef4444' }}>{(mInc - mExp) >= 0 ? `₹+${(mInc - mExp).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `₹-${Math.abs(mInc - mExp).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  );
                })}

                <div className="rpt-section-title">Expenses Ledger Breakdown (Latest to Oldest)</div>
                {sortedExpDesc.length === 0 ? <div className="rpt-empty">No expense records found.</div> : (
                  <table className="rpt-table">
                    <thead><tr>
                      <th style={{ width: '5%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '14%' }}>Date</th>
                      <th style={{ width: '33%' }}>Purpose</th>
                      <th style={{ width: '18%' }}>Added By</th>
                      <th style={{ width: '18%' }}>Added On</th>
                      <th style={{ textAlign: 'right', width: '12%' }}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {sortedExpDesc.map((exp, idx) => {
                        const prof = profiles[exp.added_by];
                        return (
                          <tr key={exp.id}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td>{new Date(exp.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td>{exp.purpose || '—'}</td>
                            <td><div>{prof?.full_name || '—'}</div>{prof?.email && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{prof.email}</div>}</td>
                            <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{fmtDT(exp.created_at)}</td>
                            <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr className="rpt-subtotal">
                      <td colSpan={5} style={{ textAlign: 'right' }}>Total Expenses:</td>
                      <td style={{ textAlign: 'right', color: '#dc2626', whiteSpace: 'nowrap' }}>₹{totalExpensesAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr></tfoot>
                  </table>
                )}

                <div className="rpt-section-title">Income Ledger Breakdown (Latest to Oldest)</div>
                {sortedIncDesc.length === 0 ? <div className="rpt-empty">No income records found.</div> : (
                  <table className="rpt-table">
                    <thead><tr>
                      <th style={{ width: '5%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '14%' }}>Date</th>
                      <th style={{ width: '33%' }}>Contributor</th>
                      <th style={{ width: '18%' }}>Added By</th>
                      <th style={{ width: '18%' }}>Added On</th>
                      <th style={{ textAlign: 'right', width: '12%' }}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {sortedIncDesc.map((inc, idx) => {
                        const prof = profiles[inc.added_by];
                        return (
                          <tr key={inc.id}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td>{new Date(inc.income_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td>{inc.donor_name || '—'}</td>
                            <td><div>{prof?.full_name || '—'}</div>{prof?.email && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{prof.email}</div>}</td>
                            <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{fmtDT(inc.created_at)}</td>
                            <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{Number(inc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr className="rpt-subtotal">
                      <td colSpan={5} style={{ textAlign: 'right' }}>Total Income:</td>
                      <td style={{ textAlign: 'right', color: '#16a34a', whiteSpace: 'nowrap' }}>₹{totalExternalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr></tfoot>
                  </table>
                )}
              </div>

              <button className="rpt-print-btn no-print" onClick={() => window.print()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>

              <style>{`
                .rpt-container { max-width: 1080px; margin: 0 auto; padding: 2rem 1rem 5rem; }
                .rpt-sheet { background: #ffffff; color: #111; padding: 3rem; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; }
                .rpt-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #e2e8f0; padding-bottom: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
                .rpt-title { margin: 0 0 0.25rem 0; font-size: 1.75rem; color: #1e293b; font-family: 'Outfit', sans-serif; font-weight: 700; }
                .rpt-subtitle { margin: 0; color: #64748b; font-size: 0.85rem; }
                .rpt-meta { font-size: 0.8rem; color: #64748b; text-align: right; }
                .rpt-summary-section { margin-bottom: 2.5rem; }
                .rpt-section-label { font-size: 0.8rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 1rem; }
                .rpt-summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; }
                .rpt-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem 0.5rem; border-radius: 8px; text-align: center; display: flex; flex-direction: column; gap: 0.4rem; }
                .rpt-card-label { font-size: 0.65rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
                .rpt-card-value { font-size: 1.05rem; font-weight: 700; color: #0f172a; white-space: nowrap; }
                .rpt-section-title { font-size: 1rem; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2.5rem; margin-bottom: 1rem; border-bottom: 2px solid #cbd5e1; padding-bottom: 0.5rem; }
                .rpt-month-block { margin-bottom: 1.5rem; page-break-inside: avoid; }
                .rpt-month-name { font-size: 0.95rem; font-weight: 700; color: #ff385c; margin: 1.25rem 0 0.6rem; text-transform: uppercase; }
                .rpt-table { width: 100%; border-collapse: collapse; margin-bottom: 0.5rem; }
                .rpt-table th, .rpt-table td { padding: 0.6rem 0.7rem; border-bottom: 1px solid #e2e8f0; font-size: 0.82rem; text-align: left; color: #334155; }
                .rpt-table th { background-color: #f1f5f9; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 0.72rem; }
                .rpt-subtotal td { font-weight: 700; background-color: #f8fafc !important; }
                .rpt-empty { padding: 1.5rem; text-align: center; color: #94a3b8; font-style: italic; background: #fafafa; border-radius: 6px; }
                .rpt-print-btn { position: fixed; bottom: 2rem; right: 2rem; background: #ff385c; color: #fff; border: none; padding: 0.75rem 1.5rem; font-size: 0.875rem; font-weight: 700; border-radius: 50px; cursor: pointer; box-shadow: 0 10px 20px rgba(255,56,92,0.4); display: flex; align-items: center; gap: 0.5rem; z-index: 200; transition: all 0.2s ease; }
                .rpt-print-btn:hover { transform: translateY(-2px); background: #e02447; box-shadow: 0 14px 24px rgba(255,56,92,0.5); }
                @media print {
                  body { background: #fff !important; }
                  .app-container { background: transparent !important; padding: 0 !important; }
                  .event-header-flat { display: none !important; }
                  .no-print { display: none !important; }
                  .rpt-container { padding: 0 !important; max-width: 100% !important; }
                  .rpt-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
                  .rpt-table th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  .rpt-subtotal td { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  .rpt-card { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
              `}</style>
            </div>
          );
        })()
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
              income={income}
              event={event}
              onRefresh={fetchBudgetAndRecords}
            />
          ) : (
            <IncomeTab
              eventId={event.id}
              currentUserId={currentUserId}
              isCreator={isCreator}
              profiles={profiles}
              income={income}
              expenses={expenses}
              event={event}
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

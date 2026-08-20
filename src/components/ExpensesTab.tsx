import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Expense, Profile } from '../types';
import { Plus, Edit2, Trash2, Calendar, FileText, Filter, X, RotateCw, ArrowUp, MoreVertical } from 'lucide-react';
import { ConfirmDialog, Toast } from './ConfirmDialog';
import type { DialogVariant } from './ConfirmDialog';

interface ExpensesTabProps {
  eventId: string;
  currentUserId: string;
  isCreator: boolean;
  profiles: Record<string, Profile>;
  expenses: Expense[];
  onRefresh: () => void;
}

export const ExpensesTab: React.FC<ExpensesTabProps> = ({
  eventId,
  currentUserId,
  isCreator,
  profiles,
  expenses,
  onRefresh,
}) => {
  // Add/Edit Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<Expense | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Form states
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]);
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Applied Filter States
  const [activeFilterFrom, setActiveFilterFrom] = useState('');
  const [activeFilterTo, setActiveFilterTo] = useState('');
  const [activeFilterSingle, setActiveFilterSingle] = useState('');
  const [activeFilterMembers, setActiveFilterMembers] = useState<string[]>([]);

  // Temporary Selector Modal States
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempMode, setTempMode] = useState<'range' | 'single' | 'member'>('range');
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');
  const [tempSingle, setTempSingle] = useState('');
  const [tempMembers, setTempMembers] = useState<string[]>([]);

  // Confirm dialog + toast state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string; confirmLabel: string; variant: DialogVariant; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', confirmLabel: 'Confirm', variant: 'danger', onConfirm: () => {} });
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null);

  const resetForm = () => {
    setAmount('');
    setExpenseDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]);
    setPurpose('');
    setErrorMsg('');
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }
    if (!expenseDate || !purpose.trim()) {
      setErrorMsg('All fields are compulsory.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.from('expenses').insert({
        event_id: eventId,
        added_by: currentUserId,
        amount: parsedAmount,
        expense_date: expenseDate,
        purpose: purpose.trim(),
        is_updated: false,
      });

      if (error) throw error;
      resetForm();
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add expense.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (exp: Expense) => {
    setEditingExpense(exp);
    setAmount(exp.amount.toString());
    setExpenseDate(exp.expense_date);
    setPurpose(exp.purpose);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }
    if (!expenseDate || !purpose.trim()) {
      setErrorMsg('All fields are compulsory.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          amount: parsedAmount,
          expense_date: expenseDate,
          purpose: purpose.trim(),
          is_updated: true, // Mark as updated
        })
        .eq('id', editingExpense.id);

      if (error) throw error;
      resetForm();
      setEditingExpense(null);
      setShowEditModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update expense.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (expId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Expense',
      message: 'Delete this expense record? This action will be logged and cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(d => ({ ...d, isOpen: false }));
        try {
          const { error } = await supabase.from('expenses').delete().eq('id', expId);
          if (error) throw error;
          onRefresh();
        } catch (err: any) {
          setToast({ message: err.message || 'Failed to delete expense.', variant: 'error' });
        }
      },
    });
  };

  const applyFilters = () => {
    if (tempMode === 'single') {
      setActiveFilterSingle(tempSingle);
      setActiveFilterFrom('');
      setActiveFilterTo('');
      setActiveFilterMembers([]);
    } else if (tempMode === 'range') {
      setActiveFilterSingle('');
      setActiveFilterFrom(tempFrom);
      setActiveFilterTo(tempTo);
      setActiveFilterMembers([]);
    } else if (tempMode === 'member') {
      setActiveFilterSingle('');
      setActiveFilterFrom('');
      setActiveFilterTo('');
      setActiveFilterMembers(tempMembers);
    }
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    setTempFrom('');
    setTempTo('');
    setTempSingle('');
    setTempMembers([]);
    setActiveFilterFrom('');
    setActiveFilterTo('');
    setActiveFilterSingle('');
    setActiveFilterMembers([]);
    setShowFilterModal(false);
  };

  // Filter records by date range, individual date, or members, sorted newest first
  const filteredExpenses = expenses
    .filter((exp) => {
      if (activeFilterMembers.length > 0) {
        return activeFilterMembers.includes(exp.added_by);
      }
      const expDateStr = exp.expense_date.split('T')[0];
      if (activeFilterSingle) return expDateStr === activeFilterSingle;
      if (activeFilterFrom && expDateStr < activeFilterFrom) return false;
      if (activeFilterTo && expDateStr > activeFilterTo) return false;
      return true;
    })
    .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());


  const formatCreationDateTime = (isoString: string) => {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} at ${timeStr}`;
  };

  const formatExpenseDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 150);
  };

  const uniqueContributors = Array.from(new Set(expenses.map((e) => e.added_by)));

  return (
    <div className="records-container">
      {/* ── Action Bar ── */}
      <div className="records-action-bar">
        <button
          className="btn btn-primary rab-add-btn"
          onClick={() => { resetForm(); setShowAddModal(true); }}
        >
          <Plus size={16} /> Add Expense
        </button>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="rab-refresh-btn"
            title="Refresh Records"
            onClick={onRefresh}
          >
            <RotateCw size={13} />
            <span className="rab-refresh-text">Refresh</span>
          </button>
          
          <button
            className={`rab-filter-btn${(activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0) ? ' active' : ''}`}
            title="Filter Records"
            onClick={() => {
              if (activeFilterMembers.length > 0) {
                setTempMode('member');
              } else {
                setTempMode(activeFilterSingle ? 'single' : 'range');
              }
              setTempFrom(activeFilterFrom);
              setTempTo(activeFilterTo);
              setTempSingle(activeFilterSingle);
              setTempMembers(activeFilterMembers);
              setShowFilterModal(true);
            }}
          >
            <Filter size={13} />
            <span>Filter</span>
            {(activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0) && <span className="rab-dot" />}
          </button>
        </div>
      </div>

      {/* ── Expenses Records Table ── */}
      <div className="records-table" ref={tableRef} onScroll={handleScroll}>
        {filteredExpenses.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No expenses found. Click "Add Expense" to record one!
          </div>
        ) : (
          filteredExpenses.map((exp) => {
            const byName = exp.added_by === currentUserId ? 'You' : (profiles[exp.added_by]?.full_name || '—');
            return (
              <div
                key={exp.id}
                className="record-row-compact"
                onClick={() => setSelectedRecord(exp)}
              >
                <div className="rrc-top">
                  <span className="rrc-date">{formatExpenseDate(exp.expense_date)}</span>
                  <span className="rrc-by-name">{byName}</span>
                  <span className="rrc-created-at">{formatCreationDateTime(exp.created_at)}</span>

                  {/* Right cluster */}
                  <div className="rrc-right-cluster">
                    <span className="rrc-amount record-amount expense-val">
                      −₹{exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>

                    {/* Desktop Direct Buttons */}
                    <div className="rrc-actions-desktop" onClick={(e) => e.stopPropagation()}>
                      {exp.added_by === currentUserId || isCreator ? (
                        <>
                          <button className="action-text-btn edit" onClick={() => handleEditClick(exp)} title="Edit">
                            <Edit2 size={12} /> Edit
                          </button>
                          <button className="action-text-btn delete" onClick={() => handleDeleteClick(exp.id)} title="Delete">
                            <Trash2 size={12} /> Delete
                          </button>
                        </>
                      ) : (
                        <div style={{ width: '135px' }} />
                      )}
                    </div>

                    {/* Mobile Three-dot Dropdown */}
                    {(exp.added_by === currentUserId || isCreator) && (
                      <div className="rrc-actions-mobile" onClick={(e) => e.stopPropagation()}>
                        <button 
                          className="action-icon-btn three-dots"
                          onClick={() => setActiveMenuId(activeMenuId === exp.id ? null : exp.id)}
                          title="Options"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {activeMenuId === exp.id && (
                          <>
                            <div className="rrc-dropdown-backdrop" onClick={() => setActiveMenuId(null)} />
                            <div className="rrc-dropdown-menu">
                              <button 
                                className="rrc-dropdown-item" 
                                onClick={() => { setActiveMenuId(null); handleEditClick(exp); }}
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button 
                                className="rrc-dropdown-item danger" 
                                onClick={() => { setActiveMenuId(null); handleDeleteClick(exp.id); }}
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Desktop-only Description */}
                    <span className="rrc-desktop-desc">
                      <strong className="rrc-desc-label">Description: </strong>
                      {exp.purpose}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Scroll-to-Top Button ── */}
      {showScrollTop && (
        <button 
          className="scroll-to-top-btn" 
          onClick={() => tableRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Scroll to Top"
        >
          <ArrowUp size={16} />
        </button>
      )}

      {/* ── Record Detail Popup ── */}
      {selectedRecord && (() => {
        const rec = selectedRecord;
        const byName = rec.added_by === currentUserId ? 'You' : (profiles[rec.added_by]?.full_name || '—');
        return (
          <div className="record-detail-overlay" onClick={() => setSelectedRecord(null)}>
            <div className="record-detail-card" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="rdc-header">
                <span className="rdc-title">Expense Detail</span>
                <button className="rdc-close" onClick={() => setSelectedRecord(null)}><X size={14} /></button>
              </div>
              {/* Amount + description */}
              <div className="rdc-amount-section">
                <div className="rdc-amount expense-val">
                  −₹{rec.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className="rdc-desc">{rec.purpose}</p>
              </div>
              {/* Meta info */}
              <div className="rdc-meta-list">
                <div className="rdc-meta-row">
                  <span className="rdc-meta-label">Date</span>
                  <span className="rdc-meta-value">{formatExpenseDate(rec.expense_date)}</span>
                </div>
                <div className="rdc-meta-row">
                  <span className="rdc-meta-label">Added by</span>
                  <span className="rdc-meta-value">{byName}</span>
                </div>
                <div className="rdc-meta-row">
                  <span className="rdc-meta-label">Added on</span>
                  <span className="rdc-meta-value">{formatCreationDateTime(rec.created_at)}</span>
                </div>
                {rec.is_updated && (
                  <div className="rdc-meta-row">
                    <span className="rdc-meta-label">Status</span>
                    <span className="record-status-tag" style={{ fontSize: '0.7rem' }}>Edited</span>
                  </div>
                )}
              </div>
              {/* Actions */}
              {rec.added_by === currentUserId && (
                <div className="rdc-actions-row">
                  <button className="btn btn-secondary" onClick={() => { setSelectedRecord(null); handleEditClick(rec); }}>
                    <Edit2 size={14} /> Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => { setSelectedRecord(null); handleDeleteClick(rec.id); }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Add Expense</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {errorMsg && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Expense Amount</label>
                <div className="input-wrapper">
                  <span style={{ position: 'absolute', left: '1.1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem' }}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Expense Date</label>
                <div className="input-wrapper">
                  <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="date"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Purpose / Description</label>
                <div className="input-wrapper">
                  <FileText size={18} style={{ position: 'absolute', left: '1rem', top: '0.85rem', color: 'var(--text-muted)' }} />
                  <textarea
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', minHeight: '80px', resize: 'vertical' }}
                    placeholder="Describe what this expense was for..."
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading || !amount || !purpose.trim()}>
                  {loading ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => { setShowEditModal(false); setEditingExpense(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Edit Expense</h3>
              <button className="modal-close" onClick={() => { setShowEditModal(false); setEditingExpense(null); }}>✕</button>
            </div>

            {errorMsg && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Expense Amount</label>
                <div className="input-wrapper">
                  <span style={{ position: 'absolute', left: '1.1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem' }}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Expense Date</label>
                <div className="input-wrapper">
                  <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="date"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Purpose / Description</label>
                <div className="input-wrapper">
                  <FileText size={18} style={{ position: 'absolute', left: '1rem', top: '0.85rem', color: 'var(--text-muted)' }} />
                  <textarea
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', minHeight: '80px', resize: 'vertical' }}
                    placeholder="Describe what this expense was for..."
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); setEditingExpense(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Filter Popup Card Modal */}
      {showFilterModal && (
        <div className="modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-title-row">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={20} style={{ color: 'var(--color-primary)' }} /> Filter Records
              </h3>
              <button className="modal-close" onClick={() => setShowFilterModal(false)}>✕</button>
            </div>

            {/* Mode Selector */}
            <div className="filter-tab-nav">
              <button
                type="button"
                className={`filter-tab-btn ${tempMode === 'range' ? 'active' : ''}`}
                onClick={() => setTempMode('range')}
              >
                Date Range
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${tempMode === 'single' ? 'active' : ''}`}
                onClick={() => setTempMode('single')}
              >
                Individual Date
              </button>
              <button
                type="button"
                className={`filter-tab-btn ${tempMode === 'member' ? 'active' : ''}`}
                onClick={() => setTempMode('member')}
              >
                By Member
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
              {tempMode === 'single' && (
                <div className="form-group">
                  <label className="form-label">Select Individual Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={tempSingle}
                    onChange={(e) => setTempSingle(e.target.value)}
                  />
                </div>
              )}
              {tempMode === 'range' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">From Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={tempFrom}
                      onChange={(e) => setTempFrom(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">To Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={tempTo}
                      onChange={(e) => setTempTo(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {tempMode === 'member' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <span className="form-label" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Filter by Contributors</span>
                  {uniqueContributors.length === 0 ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No contributors found.</span>
                  ) : (
                    <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {uniqueContributors.map((cId) => {
                        const prof = profiles[cId];
                        const name = prof?.full_name || 'Removed User';
                        const email = prof?.email || 'Unknown Email';
                        const isChecked = tempMembers.includes(cId);
                        return (
                          <label key={cId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setTempMembers(tempMembers.filter(id => id !== cId));
                                } else {
                                  setTempMembers([...tempMembers, cId]);
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{email}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              {(activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={clearFilters}
                  style={{ marginRight: 'auto', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                >
                  Clear Filters
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setShowFilterModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={applyFilters}>
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(d => ({ ...d, isOpen: false }))}
      />
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  );
};

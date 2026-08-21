import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Income, Profile, Event, Expense } from '../types';
import { Plus, Edit2, Trash2, Calendar, User, Filter, X, MoreVertical, RotateCw, ArrowUp } from 'lucide-react';
import { generateMobilePDF } from '../lib/generateMobilePDF';
import { ConfirmDialog, Toast } from './ConfirmDialog';
import type { DialogVariant } from './ConfirmDialog';

interface IncomeTabProps {
  eventId: string;
  currentUserId: string;
  isCreator: boolean;
  profiles: Record<string, Profile>;
  income: Income[];
  expenses: Expense[];
  event: Event;
  onRefresh: () => void;
}

export const IncomeTab: React.FC<IncomeTabProps> = ({
  eventId,
  currentUserId,
  isCreator,
  profiles,
  income,
  expenses,
  event,
  onRefresh,
}) => {
  // Add/Edit Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<Income | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Form states
  const [amount, setAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]);
  const [donorName, setDonorName] = useState('');
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
    setIncomeDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]);
    setDonorName('');
    setErrorMsg('');
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }
    if (!incomeDate || !donorName.trim()) {
      setErrorMsg('All fields are compulsory.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { data: insertedData, error } = await supabase
        .from('income')
        .insert({
          event_id: eventId,
          added_by: currentUserId,
          amount: parsedAmount,
          income_date: incomeDate,
          donor_name: donorName.trim(),
          is_updated: false,
          status: isCreator ? 'Approved' : 'Pending Approval'
        })
        .select()
        .single();

      if (error) throw error;

      if (!isCreator && insertedData) {
        // Send notification to creator
        const memberName = profiles[currentUserId]?.full_name || 'A member';
        const { error: notifError } = await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: event.creator_id,
          message: `${memberName} added an income of ₹${parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${donorName.trim()}) for approval`,
          income_id: insertedData.id,
          notification_type: 'income_add_request',
          status: 'pending'
        });
        if (notifError) console.error('Failed to create notification:', notifError);
        setToast({ message: 'Income request sent to admin for approval.', variant: 'info' });
      } else {
        setToast({ message: 'Income added successfully.', variant: 'success' });
      }

      resetForm();
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add income.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (inc: Income) => {
    setEditingIncome(inc);
    setAmount(inc.amount.toString());
    setIncomeDate(inc.income_date);
    setDonorName(inc.donor_name);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIncome) return;
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }
    if (!incomeDate || !donorName.trim()) {
      setErrorMsg('All fields are compulsory.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      if (isCreator) {
        const { error } = await supabase
          .from('income')
          .update({
            amount: parsedAmount,
            income_date: incomeDate,
            donor_name: donorName.trim(),
            is_updated: true,
          })
          .eq('id', editingIncome.id);

        if (error) throw error;
        setToast({ message: 'Income updated successfully.', variant: 'success' });
      } else {
        const { error } = await supabase
          .from('income')
          .update({
            status: 'Pending Update',
            pending_update: {
              amount: parsedAmount,
              donor_name: donorName.trim(),
              income_date: incomeDate
            }
          })
          .eq('id', editingIncome.id);

        if (error) throw error;

        // Send notification to creator
        const memberName = profiles[currentUserId]?.full_name || 'A member';
        const { error: notifError } = await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: event.creator_id,
          message: `${memberName} requested to update income of ₹${editingIncome.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${editingIncome.donor_name})`,
          income_id: editingIncome.id,
          notification_type: 'income_update_request',
          status: 'pending'
        });
        if (notifError) console.error('Failed to create notification:', notifError);
        setToast({ message: 'Update request sent to admin for approval.', variant: 'info' });
      }

      resetForm();
      setEditingIncome(null);
      setShowEditModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update income.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (inc: Income) => {
    setConfirmDialog({
      isOpen: true,
      title: isCreator ? 'Delete Income Record' : 'Request Delete Income',
      message: isCreator 
        ? 'Delete this income record? This action will be logged and cannot be undone.'
        : 'Send a request to the admin to delete this income record?',
      confirmLabel: isCreator ? 'Delete' : 'Send Request',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(d => ({ ...d, isOpen: false }));
        try {
          if (isCreator) {
            const { error } = await supabase.from('income').delete().eq('id', inc.id);
            if (error) throw error;
            setToast({ message: 'Income record deleted.', variant: 'success' });
          } else {
            const { error } = await supabase
              .from('income')
              .update({ status: 'Pending Delete' })
              .eq('id', inc.id);
            if (error) throw error;

            // Send notification to creator
            const memberName = profiles[currentUserId]?.full_name || 'A member';
            const { error: notifError } = await supabase.from('event_notifications').insert({
              event_id: eventId,
              member_id: event.creator_id,
              message: `${memberName} requested to delete income of ₹${inc.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${inc.donor_name})`,
              income_id: inc.id,
              notification_type: 'income_delete_request',
              status: 'pending'
            });
            if (notifError) console.error('Failed to create notification:', notifError);
            setToast({ message: 'Delete request sent to admin for approval.', variant: 'info' });
          }
          onRefresh();
        } catch (err: any) {
          setToast({ message: err.message || 'Failed to handle delete request.', variant: 'error' });
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
  const filteredIncome = income
    .filter((inc) => {
      if (activeFilterMembers.length > 0) {
        return activeFilterMembers.includes(inc.added_by);
      }
      const incDateStr = inc.income_date.split('T')[0];
      if (activeFilterSingle) return incDateStr === activeFilterSingle;
      if (activeFilterFrom && incDateStr < activeFilterFrom) return false;
      if (activeFilterTo && incDateStr > activeFilterTo) return false;
      return true;
    })
    .sort((a, b) => {
      const dateDiff = new Date(b.income_date).getTime() - new Date(a.income_date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // PDF download handler
  const handleDownloadPDF = () => {
    // ── Mobile: use jsPDF for direct file download (no print dialog) ──
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
      || window.innerWidth <= 768;

    // Build filtered arrays (same logic for both paths)
    const filteredExpensesForPdf = expenses.filter((exp) => {
      if (activeFilterMembers.length > 0) return activeFilterMembers.includes(exp.added_by);
      const expDateStr = exp.expense_date.split('T')[0];
      if (activeFilterSingle) return expDateStr === activeFilterSingle;
      if (activeFilterFrom && expDateStr < activeFilterFrom) return false;
      if (activeFilterTo && expDateStr > activeFilterTo) return false;
      return true;
    });
    const filteredIncomeForPdf = income.filter((inc) => {
      if (activeFilterMembers.length > 0) return activeFilterMembers.includes(inc.added_by);
      const incDateStr = inc.income_date.split('T')[0];
      if (activeFilterSingle) return incDateStr === activeFilterSingle;
      if (activeFilterFrom && incDateStr < activeFilterFrom) return false;
      if (activeFilterTo && incDateStr > activeFilterTo) return false;
      return true;
    });
    const isFiltered = !!(activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0);

    if (isMobile) {
      generateMobilePDF({
        eventName: event.name,
        internalFund: event.internal_fund,
        profiles,
        isFiltered,
        filteredExpenses: filteredExpensesForPdf,
        filteredIncome: filteredIncomeForPdf,
      });
      return;
    }

    // ── Desktop: original window.open / print flow (unchanged) ──

    // 3. Compute Summary Totals (Filtered or Unfiltered)
    const totalInternalFunds = event.internal_fund;
    const totalExternalFunds = filteredIncomeForPdf.reduce((sum, item) => sum + (item.status === 'Pending Approval' ? 0 : item.amount), 0);
    const totalFunds = totalInternalFunds + totalExternalFunds;
    const totalExpenses = filteredExpensesForPdf.reduce((sum, item) => sum + item.amount, 0);
    const netRemaining = totalFunds - totalExpenses;

    // 4. Combine all records for the combined chronological ledger (ordered oldest first)
    interface CombinedTx {
      type: 'expense' | 'income';
      id: string;
      date: string; // expense_date or income_date
      dateObj: Date;
      description: string;
      addedBy: string;
      amount: number;
      created_at: string;
    }

    const combinedList: CombinedTx[] = [
      ...filteredExpensesForPdf.map((exp) => ({
        type: 'expense' as const,
        id: exp.id,
        date: exp.expense_date,
        dateObj: new Date(exp.expense_date),
        description: exp.purpose,
        addedBy: exp.added_by,
        amount: exp.amount,
        created_at: exp.created_at,
      })),
      ...filteredIncomeForPdf.map((inc) => ({
        type: 'income' as const,
        id: inc.id,
        date: inc.income_date,
        dateObj: new Date(inc.income_date),
        description: inc.donor_name,
        addedBy: inc.added_by,
        amount: inc.amount,
        created_at: inc.created_at,
      })),
    ];

    // Sort chronologically (oldest first) by the user-selected date
    combinedList.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    // 5. Group combined list by Month-Year (chronological order)
    const chronologicalMonths: string[] = [];
    const monthlyGroups: Record<string, CombinedTx[]> = {};

    combinedList.forEach((tx) => {
      // e.g. "February 2026"
      const monthYearStr = tx.dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!monthlyGroups[monthYearStr]) {
        monthlyGroups[monthYearStr] = [];
        chronologicalMonths.push(monthYearStr);
      }
      monthlyGroups[monthYearStr].push(tx);
    });

    // 6. Build the Combined Monthly tables HTML
    let monthlyTablesHtml = '';
    
    chronologicalMonths.forEach((monthName) => {
      const monthTxList = monthlyGroups[monthName];
      let monthExpenses = 0;
      let monthIncome = 0;

      const rowsHtml = monthTxList.map((tx) => {
        const expenseCell = tx.type === 'expense' ? `₹${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '₹0.00';
        const incomeCell = tx.type === 'income' ? `₹${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '₹0.00';
        
        if (tx.type === 'expense') monthExpenses += tx.amount;
        if (tx.type === 'income') monthIncome += tx.amount;

        const netChange = tx.type === 'income' ? tx.amount : -tx.amount;
        const netChangeStr = netChange >= 0 
          ? `₹+${netChange.toLocaleString(undefined, { minimumFractionDigits: 2 })}` 
          : `₹-${Math.abs(netChange).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        const netColor = netChange >= 0 ? '#16a34a' : '#dc2626';

        const formattedDate = tx.dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        return `
          <tr>
            <td>${formattedDate}</td>
            <td>${tx.description || '—'}</td>
            <td style="text-align: right; color: #dc2626; white-space: nowrap;">${expenseCell}</td>
            <td style="text-align: right; color: #16a34a; white-space: nowrap;">${incomeCell}</td>
            <td style="text-align: right; color: ${netColor}; font-weight: 600; white-space: nowrap;">${netChangeStr}</td>
          </tr>
        `;
      }).join('');

      const monthNet = monthIncome - monthExpenses;
      const monthNetStr = monthNet >= 0 
        ? `₹+${monthNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}` 
        : `₹-${Math.abs(monthNet).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      const monthNetColor = monthNet >= 0 ? '#10b981' : '#ef4444';

      monthlyTablesHtml += `
        <div class="month-section" style="page-break-inside: avoid; margin-bottom: 2rem;">
          <div class="month-title">${monthName}</div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Date</th>
                <th style="width: 40%;">Description</th>
                <th style="text-align: right; width: 15%;">Expense</th>
                <th style="text-align: right; width: 15%;">Income</th>
                <th style="text-align: right; width: 18%;">Net Change</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; background-color: #f8fafc;">
                <td colspan="2" style="text-align: right;">Monthly Subtotals:</td>
                <td style="text-align: right; color: #dc2626; white-space: nowrap;">₹${monthExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style="text-align: right; color: #16a34a; white-space: nowrap;">₹${monthIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style="text-align: right; color: ${monthNetColor}; white-space: nowrap;">${monthNetStr}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    });

    // 7. Build Descending Detailed Ledgers (Latest to Oldest)
    const sortedExpensesDesc = [...filteredExpensesForPdf].sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
    const sortedIncomeDesc = [...filteredIncomeForPdf].sort((a, b) => new Date(b.income_date).getTime() - new Date(a.income_date).getTime());

    const formatCreationDateTime = (isoString: string) => {
      const d = new Date(isoString);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} at ${timeStr}`;
    };

    const detailedExpenseRows = sortedExpensesDesc.map((exp, idx) => {
      const profile = profiles[exp.added_by];
      const addedByMember = profile 
        ? `<div>${profile.full_name || '—'}</div><div style="font-size: 0.725rem; color: #64748b; font-weight: normal; margin-top: 0.15rem;">${profile.email || ''}</div>`
        : '—';
      const formattedExpenseDate = new Date(exp.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${formattedExpenseDate}</td>
          <td>${exp.purpose || '—'}</td>
          <td>${addedByMember}</td>
          <td style="font-size: 0.75rem; color: #64748b;">${formatCreationDateTime(exp.created_at)}</td>
          <td style="text-align: right; color: #dc2626; font-weight: 600;">₹${exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    const detailedIncomeRows = sortedIncomeDesc.map((inc, idx) => {
      const profile = profiles[inc.added_by];
      const addedByMember = profile 
        ? `<div>${profile.full_name || '—'}</div><div style="font-size: 0.725rem; color: #64748b; font-weight: normal; margin-top: 0.15rem;">${profile.email || ''}</div>`
        : '—';
      const formattedIncomeDate = new Date(inc.income_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${formattedIncomeDate}</td>
          <td>${inc.donor_name || '—'}</td>
          <td>${addedByMember}</td>
          <td style="font-size: 0.75rem; color: #64748b;">${formatCreationDateTime(inc.created_at)}</td>
          <td style="text-align: right; color: #16a34a; font-weight: 600;">₹${inc.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to download/print the PDF report.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Financial Report - ${event.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 2rem; color: #111; line-height: 1.5; }
            .header-container { border-bottom: 2px solid #eaeaea; padding-bottom: 1.5rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-end; }
            .header-title h1 { margin: 0 0 0.25rem 0; font-size: 1.75rem; color: #1e293b; }
            .header-title p { margin: 0; color: #64748b; font-size: 0.85rem; }
            .report-meta { text-align: right; font-size: 0.85rem; color: #64748b; }
            
            .summary-section { margin-bottom: 2.5rem; }
            .summary-title { font-size: 1.1rem; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; }
            .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; }
            .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem 0.5rem; border-radius: 8px; text-align: center; }
            .card-label { font-size: 0.7rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; }
            .card-value { font-size: 1.15rem; font-weight: 700; color: #0f172a; white-space: nowrap; }
            
            .section-title { font-size: 1.15rem; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2.5rem; margin-bottom: 1rem; border-bottom: 2px solid #cbd5e1; padding-bottom: 0.5rem; }
            .month-title { font-size: 1.05rem; font-weight: 700; color: #ff385c; margin-top: 1.5rem; margin-bottom: 0.75rem; text-transform: uppercase; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
            th, td { padding: 0.75rem 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; text-align: left; }
            th { background-color: #f1f5f9; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; }
            
            .no-records { padding: 2rem; text-align: center; color: #94a3b8; font-style: italic; background: #fafafa; border-radius: 6px; }

            @media print {
              body { padding: 0; }
              .summary-card { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              tfoot tr { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="header-title">
              <h1>${event.name}</h1>
              <p>Financial Statement & Combined Monthly Accounts Ledger</p>
            </div>
            <div class="report-meta">
              <div>Date Generated: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              ${(activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0) ? '<div style="color: #ef4444; font-weight: 600;">[Filtered Report]</div>' : ''}
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-title">Financial Summary Overview</div>
            <div class="summary-grid">
              <div class="summary-card">
                <div class="card-label">Internal Funds</div>
                <div class="card-value">₹${totalInternalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div class="summary-card">
                <div class="card-label">External Funds</div>
                <div class="card-value">₹${totalExternalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div class="summary-card">
                <div class="card-label">Total Funds</div>
                <div class="card-value" style="color: #10b981;">₹${totalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div class="summary-card">
                <div class="card-label">Total Expenses</div>
                <div class="card-value" style="color: #ef4444;">₹${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div class="summary-card">
                <div class="card-label">Net Balance</div>
                <div class="card-value" style="color: ${netRemaining >= 0 ? '#10b981' : '#ef4444'};">₹${netRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>

          <div class="section-title">Monthly Activity Ledger</div>
          ${chronologicalMonths.length === 0 ? `
            <div class="no-records">No transaction records found in the combined history.</div>
          ` : monthlyTablesHtml}

          <div class="section-title" style="page-break-before: always;">Expenses Ledger Breakdown (Latest to Oldest)</div>
          ${sortedExpensesDesc.length === 0 ? `
            <div class="no-records">No expense records found.</div>
          ` : `
            <table>
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center;">#</th>
                  <th style="width: 15%;">Date</th>
                  <th style="width: 35%;">Purpose / Description</th>
                  <th style="width: 15%;">Added By</th>
                  <th style="width: 18%;">Added On</th>
                  <th style="text-align: right; width: 12%;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${detailedExpenseRows}
              </tbody>
              <tfoot>
                <tr style="font-weight: 700; background-color: #f8fafc;">
                  <td colspan="5" style="text-align: right;">Total Expenses:</td>
                  <td style="text-align: right; color: #dc2626;">₹${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          `}

          <div class="section-title">Income Ledger Breakdown (Latest to Oldest)</div>
          ${sortedIncomeDesc.length === 0 ? `
            <div class="no-records">No income records found.</div>
          ` : `
            <table>
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center;">#</th>
                  <th style="width: 15%;">Date</th>
                  <th style="width: 35%;">Contributor</th>
                  <th style="width: 15%;">Added By</th>
                  <th style="width: 18%;">Added On</th>
                  <th style="text-align: right; width: 12%;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${detailedIncomeRows}
              </tbody>
              <tfoot>
                <tr style="font-weight: 700; background-color: #f8fafc;">
                  <td colspan="5" style="text-align: right;">Total Income:</td>
                  <td style="text-align: right; color: #16a34a;">₹${totalExternalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          `}

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Excel CSV download handler
  const handleDownloadExcel = () => {
    const filteredIncome = income
      .filter((inc) => {
        if (activeFilterMembers.length > 0) {
          return activeFilterMembers.includes(inc.added_by);
        }
        const incDateStr = inc.income_date.split('T')[0];
        if (activeFilterSingle) return incDateStr === activeFilterSingle;
        if (activeFilterFrom && incDateStr < activeFilterFrom) return false;
        if (activeFilterTo && incDateStr > activeFilterTo) return false;
        return true;
      })
      .sort((a, b) => new Date(b.income_date).getTime() - new Date(a.income_date).getTime());

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

    const sumExpenses = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
    const sumIncome = filteredIncome.reduce((sum, item) => sum + (item.status === 'Pending Approval' ? 0 : item.amount), 0);
    const baseFund = (activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0) ? 0 : event.internal_fund;
    const totalFunds = baseFund + sumIncome;
    const remainingFunds = totalFunds - sumExpenses;

    let csvContent = "\uFEFF"; // UTF-8 BOM
    
    csvContent += `"${event.name} - Financial Statement & Accounts Ledger"\n`;
    csvContent += `"Date Generated:","${new Date().toLocaleDateString()}"\n`;
    if (activeFilterFrom || activeFilterTo || activeFilterSingle || activeFilterMembers.length > 0) {
      csvContent += `"* Note:","This is a filtered financial statement."\n`;
    }
    csvContent += `\n`;

    csvContent += `"STATEMENT SUMMARY"\n`;
    csvContent += `"Total Funds (Budget)","₹${totalFunds.toFixed(2)}"\n`;
    csvContent += `"Total Expenses","₹${sumExpenses.toFixed(2)}"\n`;
    csvContent += `"Remaining Balance","₹${remainingFunds.toFixed(2)}"\n`;
    csvContent += `\n`;

    csvContent += `"INCOME LEDGER"\n`;
    csvContent += `"#","Date","Contributor","Added By","Amount"\n`;
    if (filteredIncome.length === 0) {
      csvContent += `"No income transactions found."\n`;
    } else {
      filteredIncome.forEach((inc, idx) => {
        const byName = inc.added_by === currentUserId ? 'You' : (profiles[inc.added_by]?.full_name || '—');
        csvContent += `"${idx + 1}","${new Date(inc.income_date).toLocaleDateString()}","${inc.donor_name || '—'}","${byName}","₹${inc.amount.toFixed(2)}"\n`;
      });
    }
    csvContent += `\n`;

    csvContent += `"EXPENSES LEDGER"\n`;
    csvContent += `"#","Date","Purpose / Description","Added By","Amount"\n`;
    if (filteredExpenses.length === 0) {
      csvContent += `"No expense transactions found."\n`;
    } else {
      filteredExpenses.forEach((exp, idx) => {
        const byName = exp.added_by === currentUserId ? 'You' : (profiles[exp.added_by]?.full_name || '—');
        csvContent += `"${idx + 1}","${new Date(exp.expense_date).toLocaleDateString()}","${exp.purpose || '—'}","${byName}","₹${exp.amount.toFixed(2)}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const safeEventName = event.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `${safeEventName}_financial_statement.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCreationDateTime = (isoString: string) => {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} at ${timeStr}`;
  };

  const formatIncomeDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 150);
  };

  const uniqueContributors = Array.from(new Set(income.map((i) => i.added_by)));

  return (
    <div className="records-container">
      {/* ── Action Bar ── */}
      <div className="records-action-bar">
        <button
          className="btn btn-primary rab-add-btn"
          onClick={() => { resetForm(); setShowAddModal(true); }}
        >
          <Plus size={16} /> Add Income
        </button>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* PDF Download Button */}
          <button
            className="rab-export-btn rab-export-btn--pdf"
            title="Download PDF Financial Report"
            onClick={handleDownloadPDF}
          >
            <img src="/pdf-svgrepo-com.svg" alt="PDF" width={16} height={16} style={{ display: 'block', flexShrink: 0 }} />
            <span className="rab-refresh-text">PDF</span>
          </button>

          {/* Excel Download Button */}
          <button
            className="rab-export-btn rab-export-btn--excel"
            title="Download Excel Spreadsheet"
            onClick={handleDownloadExcel}
          >
            <img src="/ms-excel-svgrepo-com.svg" alt="Excel" width={16} height={16} style={{ display: 'block', flexShrink: 0 }} />
            <span className="rab-refresh-text">Excel</span>
          </button>

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

      {/* ── Income Records Table ── */}
      <div className="records-table" ref={tableRef} onScroll={handleScroll}>
        {filteredIncome.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No income records found. Click "Add Income" to record one!
          </div>
        ) : (
          filteredIncome.map((inc) => {
            const byName = inc.added_by === currentUserId ? 'You' : (profiles[inc.added_by]?.full_name || '—');
            return (
              <div
                key={inc.id}
                className="record-row-compact"
                onClick={() => setSelectedRecord(inc)}
              >
                <div className="rrc-top">
                  <span className="rrc-date">{formatIncomeDate(inc.income_date)}</span>
                  <span className="rrc-by-name">{byName}</span>
                  <span className="rrc-created-at">{formatCreationDateTime(inc.created_at)}</span>

                  {/* Right cluster */}
                  <div className="rrc-right-cluster">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="rrc-amount record-amount income-val">
                        +₹{inc.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      {inc.status && inc.status !== 'Approved' && (
                        <span className={`status-badge ${inc.status.toLowerCase().replace(/\s+/g, '-')}`} style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          ...(inc.status === 'Pending Approval' ? {
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: 'var(--color-warning)'
                          } : inc.status === 'Pending Delete' ? {
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: 'var(--color-danger)'
                          } : {
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#3b82f6'
                          })
                        }}>
                          {inc.status}
                        </span>
                      )}
                    </div>

                    {/* Desktop Direct Buttons */}
                    <div className="rrc-actions-desktop" onClick={(e) => e.stopPropagation()}>
                      {(inc.added_by === currentUserId || isCreator) && (!inc.status || inc.status === 'Approved') ? (
                        <>
                          <button className="action-text-btn edit" onClick={() => handleEditClick(inc)} title="Edit">
                            <Edit2 size={12} /> Edit
                          </button>
                          <button className="action-text-btn delete" onClick={() => handleDeleteClick(inc)} title="Delete">
                            <Trash2 size={12} /> Delete
                          </button>
                        </>
                      ) : (
                        <div style={{ width: '135px' }} />
                      )}
                    </div>

                    {/* Mobile Three-dot Dropdown */}
                    {(inc.added_by === currentUserId || isCreator) && (!inc.status || inc.status === 'Approved') && (
                      <div className="rrc-actions-mobile" onClick={(e) => e.stopPropagation()}>
                        <button 
                          className="action-icon-btn three-dots"
                          onClick={() => setActiveMenuId(activeMenuId === inc.id ? null : inc.id)}
                          title="Options"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {activeMenuId === inc.id && (
                          <>
                            <div className="rrc-dropdown-backdrop" onClick={() => setActiveMenuId(null)} />
                            <div className="rrc-dropdown-menu">
                              <button 
                                className="rrc-dropdown-item" 
                                onClick={() => { setActiveMenuId(null); handleEditClick(inc); }}
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button 
                                className="rrc-dropdown-item danger" 
                                onClick={() => { setActiveMenuId(null); handleDeleteClick(inc); }}
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
                      {inc.donor_name}
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
                <span className="rdc-title">Income Detail</span>
                <button className="rdc-close" onClick={() => setSelectedRecord(null)}><X size={14} /></button>
              </div>
              {/* Amount + description */}
              <div className="rdc-amount-section">
                <div className="rdc-amount income-val">
                  +₹{rec.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className="rdc-desc">{rec.donor_name}</p>
              </div>
              {/* Meta info */}
              <div className="rdc-meta-list">
                <div className="rdc-meta-row">
                  <span className="rdc-meta-label">Date</span>
                  <span className="rdc-meta-value">{formatIncomeDate(rec.income_date)}</span>
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
                  <button className="btn btn-danger" onClick={() => { setSelectedRecord(null); handleDeleteClick(rec); }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add Income Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Add Income</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {errorMsg && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Income Amount</label>
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
                <label className="form-label">Income Date</label>
                <div className="input-wrapper">
                  <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="date"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    value={incomeDate}
                    onChange={(e) => setIncomeDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Income Source / Description</label>
                <div className="input-wrapper">
                  <User size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="e.g. Registration fees, Sponsorship, Fundraising…"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading || !amount || !donorName.trim()}>
                  {loading ? 'Adding...' : 'Add Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Income Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => { setShowEditModal(false); setEditingIncome(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Edit Income Record</h3>
              <button className="modal-close" onClick={() => { setShowEditModal(false); setEditingIncome(null); }}>✕</button>
            </div>

            {errorMsg && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Income Amount</label>
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
                <label className="form-label">Income Date</label>
                <div className="input-wrapper">
                  <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="date"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    value={incomeDate}
                    onChange={(e) => setIncomeDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Income Source / Description</label>
                <div className="input-wrapper">
                  <User size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="e.g. Registration fees, Sponsorship, Fundraising…"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); setEditingIncome(null); }}>
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

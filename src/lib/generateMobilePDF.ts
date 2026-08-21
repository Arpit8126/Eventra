import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Use 'Rs.' prefix since jsPDF's built-in Helvetica cannot render ₹
const rs = (amount: number) =>
  `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CombinedTx {
  type: 'expense' | 'income';
  id: string;
  dateObj: Date;
  description: string;
  amount: number;
  added_by: string;
  created_at: string;
}

export interface GenerateMobilePDFOptions {
  eventName: string;
  internalFund: number;
  profiles: Record<string, { full_name?: string; email?: string }>;
  isFiltered: boolean;
  filteredExpenses: any[];
  filteredIncome: any[];
}

export function generateMobilePDF(opts: GenerateMobilePDFOptions) {
  const { eventName, internalFund, filteredExpenses, filteredIncome, profiles, isFiltered } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const checkY = (needed: number) => {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Totals
  const totalExternalFunds = filteredIncome.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const totalFunds = internalFund + totalExternalFunds;
  const totalExpensesAmt = filteredExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const netRemaining = totalFunds - totalExpensesAmt;

  // ── HEADER ──
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text(eventName, margin, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text('Financial Statement & Combined Monthly Accounts Ledger', margin, y); y += 5;
  const dateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Generated: ${dateStr}${isFiltered ? '   [FILTERED REPORT]' : ''}`, margin, y); y += 4;
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y); y += 6;

  // ── SUMMARY CARDS ──
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105);
  doc.text('FINANCIAL SUMMARY OVERVIEW', margin, y); y += 5;

  const summaryItems = [
    { label: 'Internal Funds', value: rs(internalFund), color: [15, 23, 42] as [number,number,number] },
    { label: 'External Funds', value: rs(totalExternalFunds), color: [15, 23, 42] as [number,number,number] },
    { label: 'Total Funds', value: rs(totalFunds), color: [16, 185, 129] as [number,number,number] },
    { label: 'Total Expenses', value: rs(totalExpensesAmt), color: [220, 38, 38] as [number,number,number] },
    { label: 'Net Balance', value: rs(netRemaining), color: (netRemaining >= 0 ? [16, 185, 129] : [220, 38, 38]) as [number,number,number] },
  ];
  const cardW = (pageW - margin * 2) / summaryItems.length;
  summaryItems.forEach((item, i) => {
    const cx = margin + i * cardW;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW - 1.5, 17, 2, 2, 'FD');
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text(item.label.toUpperCase(), cx + (cardW - 1.5) / 2, y + 5.5, { align: 'center' });
    doc.setFontSize(7.5); doc.setTextColor(...item.color);
    doc.text(item.value, cx + (cardW - 1.5) / 2, y + 13, { align: 'center' });
  });
  y += 23;

  // ── MONTHLY LEDGER ──
  const combinedList: CombinedTx[] = [
    ...filteredExpenses.map((exp: any) => ({
      type: 'expense' as const, id: exp.id,
      dateObj: new Date(exp.expense_date), description: exp.purpose || '',
      amount: Number(exp.amount), added_by: exp.added_by, created_at: exp.created_at,
    })),
    ...filteredIncome.map((inc: any) => ({
      type: 'income' as const, id: inc.id,
      dateObj: new Date(inc.income_date), description: inc.donor_name || '',
      amount: Number(inc.amount), added_by: inc.added_by, created_at: inc.created_at,
    })),
  ];
  combinedList.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const chronologicalMonths: string[] = [];
  const monthlyGroups: Record<string, CombinedTx[]> = {};
  combinedList.forEach((tx) => {
    const key = tx.dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!monthlyGroups[key]) { monthlyGroups[key] = []; chronologicalMonths.push(key); }
    monthlyGroups[key].push(tx);
  });

  checkY(12);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('MONTHLY ACTIVITY LEDGER', margin, y); y += 2;
  doc.setDrawColor(203, 213, 225); doc.line(margin, y, pageW - margin, y); y += 4;

  if (chronologicalMonths.length === 0) {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(148, 163, 184);
    doc.text('No transaction records found.', margin, y); y += 8;
  } else {
    chronologicalMonths.forEach((monthName) => {
      checkY(16);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 56, 92);
      doc.text(monthName.toUpperCase(), margin, y); y += 3;

      const txs = monthlyGroups[monthName];
      let mExp = 0; let mInc = 0;
      const bodyRows = txs.map((tx) => {
        if (tx.type === 'expense') mExp += tx.amount; else mInc += tx.amount;
        const net = tx.type === 'income' ? tx.amount : -tx.amount;
        const netStr = net >= 0
          ? `Rs. +${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          : `Rs. -${Math.abs(net).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        return [
          tx.dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          tx.description || '-',
          tx.type === 'expense' ? rs(tx.amount) : 'Rs. 0.00',
          tx.type === 'income' ? rs(tx.amount) : 'Rs. 0.00',
          netStr,
        ];
      });
      const monthNet = mInc - mExp;

      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin },
        head: [['Date', 'Description', 'Expense', 'Income', 'Net Change']],
        body: bodyRows,
        foot: [['', 'Monthly Subtotals:', rs(mExp), rs(mInc),
          monthNet >= 0
            ? `Rs. +${monthNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
            : `Rs. -${Math.abs(monthNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ]],
        styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7 },
        footStyles: { fillColor: [248, 250, 252], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 20 }, 1: { cellWidth: 'auto' },
          2: { cellWidth: 32, halign: 'right', textColor: [220, 38, 38] },
          3: { cellWidth: 32, halign: 'right', textColor: [22, 163, 74] },
          4: { cellWidth: 36, halign: 'right' },
        },
        didParseCell: (data) => {
          if (data.column.index >= 2 && data.column.index <= 4) {
            data.cell.styles.halign = 'right';
          }
          if (data.section === 'body' && data.column.index === 4) {
            const v = String(data.cell.raw || '');
            data.cell.styles.textColor = v.includes('+') ? [22, 163, 74] : [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'foot' && data.column.index === 4) {
            const v = String(data.cell.raw || '');
            data.cell.styles.textColor = v.includes('+') ? [16, 185, 129] : [220, 38, 38];
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    });
  }

  // ── EXPENSES BREAKDOWN ──
  checkY(14);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('EXPENSES LEDGER BREAKDOWN (LATEST TO OLDEST)', margin, y); y += 2;
  doc.setDrawColor(203, 213, 225); doc.line(margin, y, pageW - margin, y); y += 4;

  const sortedExpDesc = [...filteredExpenses].sort(
    (a: any, b: any) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
  );
  const fmtDT = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (sortedExpDesc.length === 0) {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(148, 163, 184);
    doc.text('No expense records found.', margin, y); y += 8;
  } else {
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin },
      head: [['#', 'Date', 'Purpose', 'Added By', 'Added On', 'Amount']],
      body: sortedExpDesc.map((exp: any, idx: number) => {
        const prof = profiles[exp.added_by];
        return [
          idx + 1,
          new Date(exp.expense_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
          exp.purpose || '-',
          prof ? `${prof.full_name || '-'}\n${prof.email || ''}` : '-',
          fmtDT(exp.created_at),
          rs(Number(exp.amount)),
        ];
      }),
      foot: [['', '', '', '', 'Total Expenses:', rs(totalExpensesAmt)]],
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7 },
      footStyles: { fillColor: [248, 250, 252], textColor: [220, 38, 38], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 22 },
        2: { cellWidth: 'auto' }, 3: { cellWidth: 32 }, 4: { cellWidth: 30, fontSize: 6.5 },
        5: { cellWidth: 28, halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.column.index === 5) {
          data.cell.styles.halign = 'right';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── INCOME BREAKDOWN ──
  checkY(14);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('INCOME LEDGER BREAKDOWN (LATEST TO OLDEST)', margin, y); y += 2;
  doc.setDrawColor(203, 213, 225); doc.line(margin, y, pageW - margin, y); y += 4;

  const sortedIncDesc = [...filteredIncome].sort(
    (a: any, b: any) => new Date(b.income_date).getTime() - new Date(a.income_date).getTime()
  );

  if (sortedIncDesc.length === 0) {
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(148, 163, 184);
    doc.text('No income records found.', margin, y);
  } else {
    autoTable(doc, {
      startY: y, margin: { left: margin, right: margin },
      head: [['#', 'Date', 'Contributor', 'Added By', 'Added On', 'Amount']],
      body: sortedIncDesc.map((inc: any, idx: number) => {
        const prof = profiles[inc.added_by];
        return [
          idx + 1,
          new Date(inc.income_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
          inc.donor_name || '-',
          prof ? `${prof.full_name || '-'}\n${prof.email || ''}` : '-',
          fmtDT(inc.created_at),
          rs(Number(inc.amount)),
        ];
      }),
      foot: [['', '', '', '', 'Total Income:', rs(totalExternalFunds)]],
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7 },
      footStyles: { fillColor: [248, 250, 252], textColor: [22, 163, 74], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 22 },
        2: { cellWidth: 'auto' }, 3: { cellWidth: 32 }, 4: { cellWidth: 30, fontSize: 6.5 },
        5: { cellWidth: 28, halign: 'right', textColor: [22, 163, 74], fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.column.index === 5) {
          data.cell.styles.halign = 'right';
        }
      },
    });
  }

  // Download
  const safeName = eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`${safeName}_financial_report.pdf`);
}

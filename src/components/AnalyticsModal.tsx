import React, { useState, useRef } from 'react';
import type { Expense, Income } from '../types';
import { BarChart2, Calendar, TrendingUp, TrendingDown, ArrowUp } from 'lucide-react';

interface AnalyticsModalProps {
  expenses: Expense[];
  income: Income[];
  onClose: () => void;
  isFullPage?: boolean;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ expenses, income, onClose, isFullPage = false }) => {
  const [mode, setMode] = useState<'single' | 'range'>('range');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 40);
  };
  
  // Default values
  const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  const [singleDate, setSingleDate] = useState(todayStr);
  const [startDate, setStartDate] = useState(sevenDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [hoveredBar, setHoveredBar] = useState<{ date: string; income: number; expense: number; x: number; y: number } | null>(null);

  // Helper to format date nicely
  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // --- Calculations for Single Date Mode ---
  const singleDayExpense = expenses
    .filter((e) => e.expense_date === singleDate)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const singleDayIncome = income
    .filter((i) => i.income_date === singleDate)
    .reduce((sum, i) => sum + Number(i.amount), 0);

  // --- Calculations for Date Range Mode ---
  // Get unique sorted list of dates in the range that have data
  const getDatesInRange = (start: string, end: string) => {
    const dateList: string[] = [];
    const curr = new Date(start);
    const last = new Date(end);
    
    // Safety cap to avoid infinite loops (max 31 days displayed on graph to keep it clean)
    let safetyCounter = 0;
    while (curr <= last && safetyCounter < 31) {
      dateList.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
      safetyCounter++;
    }
    return dateList;
  };

  const datesList = mode === 'range' ? getDatesInRange(startDate, endDate) : [];

  // Group data by date
  const rangeDailyData = datesList.map((date) => {
    const dailyExp = expenses
      .filter((e) => e.expense_date === date)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const dailyInc = income
      .filter((i) => i.income_date === date)
      .reduce((sum, i) => sum + Number(i.amount), 0);

    return {
      date,
      expense: dailyExp,
      income: dailyInc,
    };
  });

  // Calculate range totals
  const rangeTotalExpense = rangeDailyData.reduce((sum, d) => sum + d.expense, 0);
  const rangeTotalIncome = rangeDailyData.reduce((sum, d) => sum + d.income, 0);

  const chartWidth = 500;
  const chartHeight = 180;
  const paddingLeft = 40;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 30;

  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  // Find max value in data to scale heights
  const maxVal = Math.max(
    ...rangeDailyData.map((d) => Math.max(d.expense, d.income)),
    100 // fallback floor to avoid division by zero
  );

  if (isFullPage) {
    return (
      <div className="section-card mobile-visible" style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontSize: '1.15rem' }}>
            <BarChart2 size={20} style={{ color: 'var(--color-primary)' }} /> Financial Analytics Hub
          </h3>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
            Go Back
          </button>
        </div>

        {/* Analytics Mode Switcher */}
        <div className="tab-nav" style={{ alignSelf: 'center', marginBottom: '1rem' }}>
          <button
            className={`tab-btn ${mode === 'range' ? 'active' : ''}`}
            onClick={() => setMode('range')}
          >
            Date Range Analysis
          </button>
          <button
            className={`tab-btn ${mode === 'single' ? 'active' : ''}`}
            onClick={() => setMode('single')}
          >
            Single Day Analysis
          </button>
        </div>

        <div className="analytics-content" ref={contentRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto' }}>
          {/* Inputs Section */}
          {mode === 'single' ? (
            <div className="form-group">
              <label className="form-label">Select Date</label>
              <div className="input-wrapper">
                <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                <input
                  type="date"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="analytics-date-inputs">
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <div className="input-wrapper">
                  <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="date"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <div className="input-wrapper">
                  <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="date"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Single Day Mode Output display */}
          {mode === 'single' ? (
            <div className="analytics-cards-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="analytics-stat-card">
                <div className="legend-item" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <TrendingUp size={16} style={{ color: 'var(--color-success)' }} />
                  Total Income
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-success)' }}>
                  +₹{singleDayIncome.toLocaleString()}
                </div>
              </div>
              <div className="analytics-stat-card">
                <div className="legend-item" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <TrendingDown size={16} style={{ color: 'var(--color-danger)' }} />
                  Total Expense
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-danger)' }}>
                  −₹{singleDayExpense.toLocaleString()}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Date Range Totals */}
              <div className="analytics-cards-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div className="analytics-stat-card">
                  <div className="legend-item" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <TrendingUp size={16} style={{ color: 'var(--color-success)' }} />
                    Total Income
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-success)' }}>
                    +₹{rangeTotalIncome.toLocaleString()}
                  </div>
                </div>
                <div className="analytics-stat-card">
                  <div className="legend-item" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <TrendingDown size={16} style={{ color: 'var(--color-danger)' }} />
                    Total Expense
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-danger)' }}>
                    −₹{rangeTotalExpense.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Range Mode Graphical Visual Display (SVG bar chart) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <span className="form-label">Income vs Expense Graph:</span>
                <div className="svg-chart-wrapper" style={{ position: 'relative', width: '100%', overflowX: 'auto', background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem 0.5rem' }}>
                  <svg
                    className="svg-chart"
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  >
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0.15" />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity="0.15" />
                      </linearGradient>
                    </defs>

                    {/* Grid Y Axis Helper lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const yVal = paddingTop + graphHeight - ratio * graphHeight;
                      const labelVal = Math.round(ratio * maxVal);

                      return (
                        <g key={ratio}>
                          <line
                            x1={paddingLeft}
                            y1={yVal}
                            x2={chartWidth - paddingRight}
                            y2={yVal}
                            stroke="rgba(255, 255, 255, 0.04)"
                            strokeDasharray="3,3"
                          />
                          <text
                            x={paddingLeft - 8}
                            y={yVal + 3}
                            fill="var(--text-muted)"
                            fontSize="8px"
                            textAnchor="end"
                          >
                            {labelVal >= 1000 ? `${(labelVal / 1000).toFixed(1)}k` : labelVal}
                          </text>
                        </g>
                      );
                    })}

                    {/* Bars Mapping */}
                    {rangeDailyData.map((d, index) => {
                      const groupWidth = graphWidth / rangeDailyData.length;
                      const groupX = paddingLeft + index * groupWidth;
                      const innerGap = 2;
                      const colWidth = (groupWidth - innerGap * 3) / 2;

                      const incomeHeight = maxVal > 0 ? (d.income / maxVal) * graphHeight : 0;
                      const expenseHeight = maxVal > 0 ? (d.expense / maxVal) * graphHeight : 0;

                      const incomeX = groupX + innerGap;
                      const incomeY = paddingTop + graphHeight - incomeHeight;
                      const expenseX = incomeX + colWidth + innerGap;
                      const expenseY = paddingTop + graphHeight - expenseHeight;

                      const showLabel = rangeDailyData.length <= 15 || index % Math.ceil(rangeDailyData.length / 8) === 0;

                      return (
                        <g key={d.date} className="bar-group">
                          {/* Income Bar */}
                          <rect
                            className="svg-bar"
                            x={incomeX}
                            y={incomeY}
                            width={Math.max(colWidth, 1)}
                            height={Math.max(incomeHeight, 1)}
                            fill="url(#incomeGrad)"
                            rx="2"
                            onMouseEnter={(e) => {
                              const rectEl = e.currentTarget.getBoundingClientRect();
                              const wrapperEl = e.currentTarget.ownerDocument.querySelector('.svg-chart-wrapper')?.getBoundingClientRect();
                              const relX = rectEl.left - (wrapperEl?.left || 0) + rectEl.width / 2;
                              setHoveredBar({
                                date: d.date,
                                income: d.income,
                                expense: d.expense,
                                x: relX,
                                y: incomeY
                              });
                            }}
                            onMouseLeave={() => setHoveredBar(null)}
                          />

                          {/* Expense Bar */}
                          <rect
                            className="svg-bar"
                            x={expenseX}
                            y={expenseY}
                            width={Math.max(colWidth, 1)}
                            height={Math.max(expenseHeight, 1)}
                            fill="url(#expenseGrad)"
                            rx="2"
                            onMouseEnter={(e) => {
                              const rectEl = e.currentTarget.getBoundingClientRect();
                              const wrapperEl = e.currentTarget.ownerDocument.querySelector('.svg-chart-wrapper')?.getBoundingClientRect();
                              const relX = rectEl.left - (wrapperEl?.left || 0) + rectEl.width / 2;
                              setHoveredBar({
                                date: d.date,
                                income: d.income,
                                expense: d.expense,
                                x: relX,
                                y: expenseY
                              });
                            }}
                            onMouseLeave={() => setHoveredBar(null)}
                          />

                          {/* Date X Label */}
                          {showLabel && (
                            <text
                              x={groupX + groupWidth / 2}
                              y={chartHeight - 12}
                              fill="var(--text-muted)"
                              fontSize="8px"
                              textAnchor="middle"
                            >
                              {formatDateLabel(d.date)}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Bottom Base Line */}
                    <line
                      x1={paddingLeft}
                      y1={paddingTop + graphHeight}
                      x2={chartWidth - paddingRight}
                      y2={paddingTop + graphHeight}
                      stroke="var(--border-color)"
                    />
                  </svg>

                  {/* Tooltip Popup */}
                  {hoveredBar && (
                    <div
                      className="chart-tooltip"
                      style={{
                        left: `${hoveredBar.x}px`,
                        top: `${hoveredBar.y + 12}px`,
                        transform: 'translate(-50%, -100%)',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>{formatDateLabel(hoveredBar.date)}</div>
                      <div style={{ color: 'var(--color-success)' }}>Income: ₹{hoveredBar.income.toLocaleString()}</div>
                      <div style={{ color: 'var(--color-danger)' }}>Expense: ₹{hoveredBar.expense.toLocaleString()}</div>
                    </div>
                  )}
                </div>

                {/* Legends */}
                <div className="chart-legends">
                  <div className="legend-item">
                    <div className="legend-color" style={{ background: 'var(--color-success)' }}></div>
                    <span>Income</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ background: 'var(--color-danger)' }}></div>
                    <span>Expense</span>
                  </div>
                </div>
              </div>

              {/* Range Daily Breakdown Table list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span className="form-label">Daily Breakdown:</span>
                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                  {rangeDailyData
                    .filter((d) => d.expense > 0 || d.income > 0)
                    .map((d) => (
                      <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.4rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span>{formatDateLabel(d.date)}</span>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ color: 'var(--color-success)' }}>+₹{d.income.toLocaleString()}</span>
                          <span style={{ color: 'var(--color-danger)' }}>-₹{d.expense.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  {rangeDailyData.filter((d) => d.expense > 0 || d.income > 0).length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No data recorded within this date range.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-title-row">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={20} style={{ color: 'var(--color-primary)' }} /> Financial Analytics
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Analytics Mode Switcher */}
        <div className="tab-nav" style={{ alignSelf: 'center', marginBottom: '0.5rem' }}>
          <button
            className={`tab-btn ${mode === 'range' ? 'active' : ''}`}
            onClick={() => setMode('range')}
          >
            Date Range Analysis
          </button>
          <button
            className={`tab-btn ${mode === 'single' ? 'active' : ''}`}
            onClick={() => setMode('single')}
          >
            Single Day Analysis
          </button>
        </div>

        <div className="analytics-content" ref={contentRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto' }}>
          {/* Inputs Section */}
          {mode === 'single' ? (
            <div className="form-group">
              <label className="form-label">Select Date</label>
              <div className="input-wrapper">
                <Calendar size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                <input
                  type="date"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                />
              </div>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">From Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Single Day View Card Output */}
          {mode === 'single' && (
            <div className="analytics-cards-grid">
              <div className="analytics-stat-card inc">
                <h4>Cumulative Income</h4>
                <div className="val">₹{singleDayIncome.toLocaleString()}</div>
              </div>
              <div className="analytics-stat-card exp">
                <h4>Cumulative Expense</h4>
                <div className="val">₹{singleDayExpense.toLocaleString()}</div>
              </div>
              <div className="analytics-stat-card" style={{ gridColumn: 'span 2', background: 'rgba(255,255,255,0.03)' }}>
                <h4>Net Day Margin</h4>
                <div className="val" style={{ color: singleDayIncome - singleDayExpense >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {singleDayIncome - singleDayExpense >= 0 ? '+' : ''}
                  ₹{(singleDayIncome - singleDayExpense).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Date Range Output + Custom Chart */}
          {mode === 'range' && (
            <>
              {/* Range Totals Summary */}
              <div className="analytics-cards-grid">
                <div className="analytics-stat-card inc">
                  <h4>Total Income in Range</h4>
                  <div className="val" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <TrendingUp size={16} /> ₹{rangeTotalIncome.toLocaleString()}
                  </div>
                </div>
                <div className="analytics-stat-card exp">
                  <h4>Total Expenses in Range</h4>
                  <div className="val" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                    <TrendingDown size={16} /> ₹{rangeTotalExpense.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Glowing Premium SVG Bar Chart */}
              <div className="analytics-visual-container" style={{ width: '100%' }}>
                <div className="svg-chart-wrapper" style={{ position: 'relative', width: '100%', overflowX: 'auto', background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem 0.5rem' }}>
                  <svg
                    className="svg-chart"
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  >
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#047857" stopOpacity="0.2" />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#B91C1C" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>

                    {/* Y-Axis Grid Lines & Labels */}
                    {[0, 0.5, 1].map((ratio, idx) => {
                      const yVal = paddingTop + (1 - ratio) * graphHeight;
                      const labelVal = Math.round(ratio * maxVal);
                      return (
                        <g key={idx}>
                          <line
                            x1={paddingLeft}
                            y1={yVal}
                            x2={chartWidth - paddingRight}
                            y2={yVal}
                            stroke="var(--border-color)"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={paddingLeft - 8}
                            y={yVal + 4}
                            fill="var(--text-muted)"
                            fontSize="9px"
                            textAnchor="end"
                          >
                            {labelVal >= 1000 ? `${(labelVal / 1000).toFixed(1)}k` : labelVal}
                          </text>
                        </g>
                      );
                    })}

                    {/* Chart Bars */}
                    {rangeDailyData.map((d, idx) => {
                      const numBars = rangeDailyData.length;
                      const barSpacing = graphWidth / numBars;
                      const groupWidth = barSpacing * 0.85;
                      const singleBarWidth = groupWidth / 2 * 0.85;

                      const groupX = paddingLeft + idx * barSpacing + (barSpacing - groupWidth) / 2;
                      const incomeX = groupX;
                      const expenseX = groupX + singleBarWidth + 2;

                      const incomeHeight = (d.income / maxVal) * graphHeight;
                      const expenseHeight = (d.expense / maxVal) * graphHeight;

                      const incomeY = paddingTop + graphHeight - incomeHeight;
                      const expenseY = paddingTop + graphHeight - expenseHeight;

                      // Display X axis labels at intervals if there are many dates
                      const showLabel = numBars <= 10 || idx % Math.ceil(numBars / 6) === 0;

                      return (
                        <g key={d.date}>
                          {/* Income Bar (Emerald) */}
                          <rect
                            x={incomeX}
                            y={incomeY}
                            width={singleBarWidth}
                            height={Math.max(incomeHeight, 2)} // floor to 2px so zero is slightly visible
                            fill="url(#incomeGrad)"
                            rx={2}
                            className="svg-bar"
                            onMouseEnter={() => {
                              setHoveredBar({
                                date: d.date,
                                income: d.income,
                                expense: d.expense,
                                x: incomeX + singleBarWidth,
                                y: incomeY
                              });
                            }}
                            onMouseLeave={() => setHoveredBar(null)}
                          />

                          {/* Expense Bar (Red) */}
                          <rect
                            x={expenseX}
                            y={expenseY}
                            width={singleBarWidth}
                            height={Math.max(expenseHeight, 2)}
                            fill="url(#expenseGrad)"
                            rx={2}
                            className="svg-bar"
                            onMouseEnter={() => {
                              setHoveredBar({
                                date: d.date,
                                income: d.income,
                                expense: d.expense,
                                x: expenseX,
                                y: expenseY
                              });
                            }}
                            onMouseLeave={() => setHoveredBar(null)}
                          />

                          {/* X-Axis Date Label */}
                          {showLabel && (
                            <text
                              x={groupX + groupWidth / 2}
                              y={chartHeight - 12}
                              fill="var(--text-muted)"
                              fontSize="9px"
                              textAnchor="middle"
                            >
                              {formatDateLabel(d.date)}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Bottom Base Line */}
                    <line
                      x1={paddingLeft}
                      y1={paddingTop + graphHeight}
                      x2={chartWidth - paddingRight}
                      y2={paddingTop + graphHeight}
                      stroke="var(--border-color)"
                    />
                  </svg>

                  {/* Tooltip Popup */}
                  {hoveredBar && (
                    <div
                      className="chart-tooltip"
                      style={{
                        left: `${hoveredBar.x}px`,
                        top: `${hoveredBar.y + 12}px`,
                        transform: 'translate(-50%, -100%)',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>{formatDateLabel(hoveredBar.date)}</div>
                      <div style={{ color: 'var(--color-success)' }}>Income: ₹{hoveredBar.income.toLocaleString()}</div>
                      <div style={{ color: 'var(--color-danger)' }}>Expense: ₹{hoveredBar.expense.toLocaleString()}</div>
                    </div>
                  )}
                </div>

                {/* Legends */}
                <div className="chart-legends">
                  <div className="legend-item">
                    <div className="legend-color" style={{ background: 'var(--color-success)' }}></div>
                    <span>Income</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ background: 'var(--color-danger)' }}></div>
                    <span>Expense</span>
                  </div>
                </div>
              </div>

              {/* Range Daily Breakdown Table list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span className="form-label">Daily Breakdown:</span>
                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                  {rangeDailyData
                    .filter((d) => d.expense > 0 || d.income > 0)
                    .map((d) => (
                      <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.4rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <span>{formatDateLabel(d.date)}</span>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ color: 'var(--color-success)' }}>+₹{d.income.toLocaleString()}</span>
                          <span style={{ color: 'var(--color-danger)' }}>-₹{d.expense.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  {rangeDailyData.filter((d) => d.expense > 0 || d.income > 0).length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No data recorded within this date range.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {showScrollTop && (
          <button 
            className="scroll-to-top-btn" 
            onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Scroll to Top"
            style={{ position: 'absolute', bottom: '1.5rem', right: '1.5rem', zIndex: 99 }}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

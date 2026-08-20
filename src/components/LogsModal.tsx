import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { AuditLog, Profile } from '../types';
import { FileText, Loader2, ArrowRight, ArrowUp } from 'lucide-react';

interface LogsModalProps {
  eventId: string;
  onClose: () => void;
  isFullPage?: boolean;
}

export const LogsModal: React.FC<LogsModalProps> = ({ eventId, onClose, isFullPage = false }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 40);
  };

  useEffect(() => {
    const fetchLogsAndProfiles = async () => {
      setLoading(true);
      try {
        // 1. Fetch logs
        const { data: logsData, error: logsErr } = await supabase
          .from('logs')
          .select('*')
          .eq('event_id', eventId)
          .order('created_at', { ascending: false });

        if (logsErr) throw logsErr;
        const parsedLogs = logsData || [];

        // 2. Fetch profiles to resolve names
        const { data: profilesData, error: profilesErr } = await supabase
          .from('profiles')
          .select('*');

        if (profilesErr) throw profilesErr;

        const profileMap: Record<string, Profile> = {};
        (profilesData || []).forEach((p) => {
          profileMap[p.id] = p;
        });

        setLogs(parsedLogs);
        setProfiles(profileMap);
      } catch (err: any) {
        console.error('Error fetching logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogsAndProfiles();
  }, [eventId]);

  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { date: dateStr, time: timeStr };
  };

  const getActorText = (actorId: string) => {
    const profile = profiles[actorId];
    return profile ? `${profile.full_name} (${profile.email})` : 'Unknown User';
  };

  const renderLogDetails = (log: AuditLog) => {
    const details = log.details;
    
    switch (log.action_type) {
      case 'UPDATE_INTERNAL_FUND': {
        const prev = parseFloat(details.previous_amount || 0);
        const next = parseFloat(details.new_amount || 0);
        const diff = next - prev;
        const diffClass = diff >= 0 ? 'text-success' : 'text-danger';
        const diffSign = diff >= 0 ? '+' : '';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>Updated Internal Fund</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span>₹{prev.toLocaleString()}</span>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span>₹{next.toLocaleString()}</span>
              <span className={diffClass} style={{ fontWeight: 600, marginLeft: '0.5rem' }}>
                ({diffSign}₹{diff.toLocaleString()} difference)
              </span>
            </div>
          </div>
        );
      }

      case 'DELETE_EXPENSE':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Deleted Expense</span>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div><strong>Amount:</strong> ₹{parseFloat(details.amount || 0).toLocaleString()}</div>
              <div><strong>Expense Date:</strong> {details.expense_date}</div>
              <div><strong>Added By:</strong> {getActorText(details.added_by)}</div>
              <div style={{ marginTop: '0.35rem' }}>
                <strong>Purpose:</strong>
                <div className="log-purpose-box">{details.purpose}</div>
              </div>
            </div>
          </div>
        );

      case 'DELETE_INCOME':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Deleted Income (External Fund)</span>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div><strong>Amount:</strong> ₹{parseFloat(details.amount || 0).toLocaleString()}</div>
              <div><strong>Income Date:</strong> {details.income_date}</div>
              <div><strong>Added By:</strong> {getActorText(details.added_by)}</div>
              <div style={{ marginTop: '0.35rem' }}>
                <strong>Donor Name (Description):</strong>
                <div className="log-purpose-box">{details.donor_name}</div>
              </div>
            </div>
          </div>
        );

      case 'UPDATE_EXPENSE': {
        const prevAmt = parseFloat(details.previous_amount || 0);
        const newAmt = parseFloat(details.new_amount || 0);
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>Updated Expense</span>
            <div className="log-update-grid" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.4rem' }}>Before:</strong>
                <div><strong>Amount:</strong> ₹{prevAmt.toLocaleString()}</div>
                <div><strong>Date:</strong> {details.previous_expense_date}</div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Purpose:</strong>
                  <div className="log-purpose-box">{details.previous_purpose}</div>
                </div>
              </div>
              <div className="log-after-block">
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.4rem' }}>After:</strong>
                <div><strong>Amount:</strong> ₹{newAmt.toLocaleString()}</div>
                <div><strong>Date:</strong> {details.new_expense_date}</div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Purpose:</strong>
                  <div className="log-purpose-box">{details.new_purpose}</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'UPDATE_INCOME': {
        const prevAmt = parseFloat(details.previous_amount || 0);
        const newAmt = parseFloat(details.new_amount || 0);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>Updated Income</span>
            <div className="log-update-grid" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.4rem' }}>Before:</strong>
                <div><strong>Amount:</strong> ₹{prevAmt.toLocaleString()}</div>
                <div><strong>Date:</strong> {details.previous_income_date}</div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Donor Name (Description):</strong>
                  <div className="log-purpose-box">{details.previous_donor_name}</div>
                </div>
              </div>
              <div className="log-after-block">
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.4rem' }}>After:</strong>
                <div><strong>Amount:</strong> ₹{newAmt.toLocaleString()}</div>
                <div><strong>Date:</strong> {details.new_income_date}</div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Donor Name (Description):</strong>
                  <div className="log-purpose-box">{details.new_donor_name}</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      default:
        return <span>Unknown Action Log</span>;
    }
  };

  if (isFullPage) {
    return (
      <div className="section-card mobile-visible" style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontSize: '1.15rem' }}>
            <FileText size={20} style={{ color: 'var(--color-primary)' }} /> Audit Logs Trail
          </h3>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
            Go Back
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '1rem', padding: '3rem' }}>
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading event logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', flex: 1 }}>
            No actions have been logged for this event yet.
          </div>
        ) : (
          <div className="logs-list" ref={listRef} onScroll={handleScroll} style={{ flex: 1, maxHeight: 'none', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {logs.map((log) => {
              const dt = formatDateTime(log.created_at);
              return (
                <div key={log.id} className="log-item">
                  <div className="log-meta">
                    <span className={`log-tag ${log.action_type.toLowerCase()}`}>
                      {log.action_type.replace('UPDATE_', '').replace('DELETE_', '')}
                    </span>
                    <span>
                      Performed by: <strong>{profiles[log.performed_by]?.full_name || 'Unknown'}</strong> on {dt.date} at {dt.time}
                    </span>
                  </div>
                  <div className="log-body">
                    {renderLogDetails(log)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showScrollTop && (
          <button 
            className="scroll-to-top-btn" 
            onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Scroll to Top"
          >
            <ArrowUp size={16} />
          </button>
        )}

        <style>{`
          .text-success { color: var(--color-success) !important; }
          .text-danger { color: var(--color-danger) !important; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        <div className="modal-title-row">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} style={{ color: 'var(--color-primary)' }} /> Audit Logs
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem', gap: '1rem' }}>
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading event logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No actions have been logged for this event yet.
          </div>
        ) : (
          <div 
            className="logs-list" 
            ref={listRef} 
            onScroll={handleScroll} 
            style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {logs.map((log) => {
              const dt = formatDateTime(log.created_at);
              return (
                <div key={log.id} className="log-item">
                  <div className="log-meta">
                    <span className={`log-tag ${log.action_type.toLowerCase()}`}>
                      {log.action_type.replace('UPDATE_', '').replace('DELETE_', '')}
                    </span>
                    <span>
                      Performed by: <strong>{profiles[log.performed_by]?.full_name || 'Unknown'}</strong> on {dt.date} at {dt.time}
                    </span>
                  </div>
                  <div className="log-body">
                    {renderLogDetails(log)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {showScrollTop && (
          <button 
            className="scroll-to-top-btn" 
            onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Scroll to Top"
            style={{ zIndex: 1000 }}
          >
            <ArrowUp size={16} />
          </button>
        )}

        <style>{`
          .text-success { color: var(--color-success) !important; }
          .text-danger { color: var(--color-danger) !important; }
        `}</style>
      </div>
    </div>
  );
};

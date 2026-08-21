import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Loader2, Bell, BellOff, ArrowLeft, Check, X, Eye, 
  User, ArrowRight 
} from 'lucide-react';
import type { EventNotification, Profile, Income } from '../types';

interface NotificationsTabProps {
  eventId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ 
  eventId, 
  onClose,
  onUpdate 
}) => {
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [incomes, setIncomes] = useState<Record<string, Income>>({});
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [creatorName, setCreatorName] = useState('Admin');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Action loading states by notification ID
  const [loadingActions, setLoadingActions] = useState<Record<string, 'approve' | 'reject' | undefined>>({});
  
  // Selected income record for detail view modal
  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);

  const fetchNotificationsAndDetails = async () => {
    setErrorMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found.');

      // 1. Fetch current profile to get admin name if creator
      const { data: adminProf } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (adminProf?.full_name) {
        setCreatorName(adminProf.full_name);
      }

      // 2. Check if user is event creator
      const { data: eventData, error: eventErr } = await supabase
        .from('events')
        .select('creator_id')
        .eq('id', eventId)
        .single();
      
      if (eventErr) throw eventErr;
      const creatorCheck = eventData?.creator_id === user.id;
      setIsCreator(creatorCheck);

      // 3. Fetch notifications
      const { data: notifData, error: notifErr } = await supabase
        .from('event_notifications')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (notifErr) throw notifErr;
      const fetchedNotifs = (notifData || []) as EventNotification[];
      setNotifications(fetchedNotifs);

      // 4. Fetch profiles of notification owners/members
      if (fetchedNotifs.length > 0) {
        const uniqueMemberIds = Array.from(new Set(fetchedNotifs.map((n) => n.member_id)));
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', uniqueMemberIds);

        const profileMap: Record<string, Profile> = {};
        (profilesData || []).forEach((p) => {
          profileMap[p.id] = p;
        });
        setProfiles(profileMap);

        // 5. Fetch referenced income details
        const referencedIncomeIds = fetchedNotifs
          .map((n) => n.income_id)
          .filter(Boolean) as string[];

        if (referencedIncomeIds.length > 0) {
          const { data: incomeData } = await supabase
            .from('income')
            .select('*')
            .in('id', referencedIncomeIds);

          const incomeMap: Record<string, Income> = {};
          (incomeData || []).forEach((inc) => {
            incomeMap[inc.id] = inc;
          });
          setIncomes(incomeMap);
        }
      }
    } catch (err: any) {
      console.error('Error fetching event notifications:', err);
      setErrorMsg(err.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotificationsAndDetails();
  }, [eventId]);

  const handleApprove = async (e: React.MouseEvent, notif: EventNotification) => {
    e.stopPropagation();
    if (!notif.income_id) return;
    setLoadingActions(prev => ({ ...prev, [notif.id]: 'approve' }));
    try {
      // 1. Fetch current income record
      const { data: incData, error: incErr } = await supabase
        .from('income')
        .select('*')
        .eq('id', notif.income_id)
        .single();
      if (incErr) throw incErr;

      // 2. Perform database updates based on notification_type
      if (notif.notification_type === 'income_add_request') {
        const { error: updErr } = await supabase
          .from('income')
          .update({ status: 'Approved' })
          .eq('id', notif.income_id);
        if (updErr) throw updErr;

        // Insert notification for the member who added it
        await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: incData.added_by,
          message: `Your income of ₹${incData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${incData.donor_name}) has been accepted by ${creatorName}`,
          notification_type: 'info',
          status: 'approved'
        });

      } else if (notif.notification_type === 'income_delete_request') {
        const { error: delErr } = await supabase
          .from('income')
          .delete()
          .eq('id', notif.income_id);
        if (delErr) throw delErr;

        // Insert notification for the member
        await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: incData.added_by,
          message: `Your request to delete income of ₹${incData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${incData.donor_name}) has been accepted by ${creatorName}`,
          notification_type: 'info',
          status: 'approved'
        });

      } else if (notif.notification_type === 'income_update_request') {
        const proposed = incData.pending_update;
        if (!proposed) throw new Error('Proposed update data not found.');

        const { error: updErr } = await supabase
          .from('income')
          .update({
            status: 'Approved',
            amount: proposed.amount,
            donor_name: proposed.donor_name,
            income_date: proposed.income_date,
            pending_update: null,
            is_updated: true
          })
          .eq('id', notif.income_id);
        if (updErr) throw updErr;

        // Insert notification for the member
        await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: incData.added_by,
          message: `Your request to update income of ₹${incData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${incData.donor_name}) has been accepted by ${creatorName}`,
          notification_type: 'info',
          status: 'approved'
        });
      }

      // 3. Delete the request notification
      await supabase.from('event_notifications').delete().eq('id', notif.id);

      // Refresh list
      await fetchNotificationsAndDetails();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      alert(err.message || 'Failed to approve request.');
    } finally {
      setLoadingActions(prev => ({ ...prev, [notif.id]: undefined }));
    }
  };

  const handleReject = async (e: React.MouseEvent, notif: EventNotification) => {
    e.stopPropagation();
    if (!notif.income_id) return;
    setLoadingActions(prev => ({ ...prev, [notif.id]: 'reject' }));
    try {
      // 1. Fetch current income record
      const { data: incData, error: incErr } = await supabase
        .from('income')
        .select('*')
        .eq('id', notif.income_id)
        .single();
      if (incErr) throw incErr;

      // 2. Perform updates
      if (notif.notification_type === 'income_add_request') {
        // Delete the income record
        const { error: delErr } = await supabase
          .from('income')
          .delete()
          .eq('id', notif.income_id);
        if (delErr) throw delErr;

        // Insert notification for the member
        await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: incData.added_by,
          message: `Your income record of ₹${incData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${incData.donor_name}) has been rejected by ${creatorName}`,
          notification_type: 'info',
          status: 'rejected'
        });

      } else if (notif.notification_type === 'income_delete_request') {
        // Revert status to approved
        const { error: updErr } = await supabase
          .from('income')
          .update({ status: 'Approved' })
          .eq('id', notif.income_id);
        if (updErr) throw updErr;

        // Insert notification for the member
        await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: incData.added_by,
          message: `Your request to delete income of ₹${incData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${incData.donor_name}) has been rejected by ${creatorName}`,
          notification_type: 'info',
          status: 'rejected'
        });

      } else if (notif.notification_type === 'income_update_request') {
        // Revert status to approved and clear pending_update
        const { error: updErr } = await supabase
          .from('income')
          .update({ status: 'Approved', pending_update: null })
          .eq('id', notif.income_id);
        if (updErr) throw updErr;

        // Insert notification for the member
        await supabase.from('event_notifications').insert({
          event_id: eventId,
          member_id: incData.added_by,
          message: `Your request to update income of ₹${incData.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${incData.donor_name}) has been rejected by ${creatorName}`,
          notification_type: 'info',
          status: 'rejected'
        });
      }

      // 3. Delete request notification
      await supabase.from('event_notifications').delete().eq('id', notif.id);

      // Refresh list
      await fetchNotificationsAndDetails();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      alert(err.message || 'Failed to reject request.');
    } finally {
      setLoadingActions(prev => ({ ...prev, [notif.id]: undefined }));
    }
  };

  const handleRowClick = (notif: EventNotification) => {
    if (notif.income_id && incomes[notif.income_id]) {
      setSelectedIncome(incomes[notif.income_id]);
    }
  };

  return (
    <div className="notifications-page-container" style={{ padding: '1.5rem 1rem 5rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          className="back-btn" 
          onClick={onClose} 
          title="Back to Event Details"
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'var(--bg-item)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '50%', 
            width: '40px', 
            height: '40px', 
            minWidth: '40px', 
            minHeight: '40px', 
            cursor: 'pointer',
            padding: 0 
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={22} style={{ color: 'var(--color-primary)' }} />
            Event Notifications
          </h2>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {isCreator ? "System activity feed and approval requests history for all members." : "Personal notifications and activity regarding your contributions."}
          </p>
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
          <p style={{ color: 'var(--text-muted)' }}>Retrieving notification feed...</p>
        </div>
      ) : notifications.length === 0 ? (
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
          gap: '1rem'
        }}>
          <BellOff size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>No notifications found</h4>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Notifications will appear here when internal or external funds are added, updated, or delete approvals are requested.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notifications.map((notif) => {
            const recipient = profiles[notif.member_id];
            const isRequest = notif.notification_type && notif.notification_type !== 'info';
            const actionLoading = loadingActions[notif.id];
            
            return (
              <div 
                key={notif.id} 
                className="notif-card"
                onClick={() => notif.income_id && handleRowClick(notif)}
                style={{
                  background: 'var(--bg-item)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  cursor: notif.income_id ? 'pointer' : 'default',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flex: 1, minWidth: '220px' }}>
                    <div style={{ 
                      background: isRequest ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 56, 92, 0.1)', 
                      borderRadius: '50%', 
                      padding: '0.45rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: isRequest ? 'var(--color-warning)' : 'var(--color-primary)',
                      marginTop: '0.1rem',
                      flexShrink: 0
                    }}>
                      <Bell size={15} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-main)', lineHeight: '1.4', fontWeight: 500 }}>
                          {notif.message}
                        </p>
                        {isRequest && (
                          <span style={{
                            fontSize: '0.625rem',
                            background: 'var(--color-primary)',
                            color: '#fff',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            Approval Required
                          </span>
                        )}
                      </div>
                      
                      {isCreator && recipient && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>Submitted By:</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{recipient.full_name}</span>
                          <span>({recipient.email})</span>
                        </div>
                      )}
                      
                      {notif.income_id && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                          <Eye size={12} /> Click to preview full record data
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(notif.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(notif.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    
                    {/* Approval Actions for Event Creator */}
                    {isCreator && isRequest && (
                      <div className="notif-actions-container" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                        {/* Desktop Actions */}
                        <div className="notif-actions-desktop" style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary"
                            disabled={!!actionLoading}
                            onClick={(e) => handleApprove(e, notif)}
                            style={{ 
                              padding: '0.35rem 0.85rem', 
                              fontSize: '0.75rem', 
                              height: '30px', 
                              background: 'var(--color-success)', 
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            {actionLoading === 'approve' ? (
                              <Loader2 className="animate-spin" size={12} />
                            ) : (
                              <Check size={12} />
                            )}
                            Approve
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={!!actionLoading}
                            onClick={(e) => handleReject(e, notif)}
                            style={{ 
                              padding: '0.35rem 0.85rem', 
                              fontSize: '0.75rem', 
                              height: '30px', 
                              borderColor: 'var(--color-danger)', 
                              color: 'var(--color-danger)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            {actionLoading === 'reject' ? (
                              <Loader2 className="animate-spin" size={12} />
                            ) : (
                              <X size={12} />
                            )}
                            Reject
                          </button>
                        </div>

                        {/* Mobile Actions */}
                        <div className="notif-actions-mobile" style={{ display: 'none', gap: '0.5rem' }}>
                          <button
                            className="action-icon-btn approve"
                            disabled={!!actionLoading}
                            onClick={(e) => handleApprove(e, notif)}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: 'var(--color-success)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="Approve"
                          >
                            {actionLoading === 'approve' ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          </button>
                          <button
                            className="action-icon-btn reject"
                            disabled={!!actionLoading}
                            onClick={(e) => handleReject(e, notif)}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: 'var(--color-danger)',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="Reject"
                          >
                            {actionLoading === 'reject' ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record Preview Modal */}
      {selectedIncome && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="auth-card" style={{ width: '100%', maxWidth: '500px', padding: '1.75rem', position: 'relative' }}>
            <button 
              onClick={() => setSelectedIncome(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
              <Bell size={20} style={{ color: 'var(--color-primary)' }} />
              Income Approval Record Details
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--bg-item)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <User size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Submitted By</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {profiles[selectedIncome.added_by]?.full_name || 'A member'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {profiles[selectedIncome.added_by]?.email || ''}
                  </div>
                </div>
              </div>

              {/* Approval status indicator */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Current Status</span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '50px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: selectedIncome.status === 'Pending Approval' ? 'rgba(245, 158, 11, 0.15)' : selectedIncome.status === 'Pending Delete' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: selectedIncome.status === 'Pending Approval' ? 'var(--color-warning)' : selectedIncome.status === 'Pending Delete' ? 'var(--color-danger)' : '#3b82f6'
                }}>
                  {selectedIncome.status || 'Pending Approval'}
                </span>
              </div>

              {/* Data fields depending on status */}
              {selectedIncome.status === 'Pending Update' && selectedIncome.pending_update ? (
                // Split view for proposed update changes
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    Proposed Updates
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-item)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                    {/* Left (Original) */}
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Original Amount</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>₹{selectedIncome.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Original Contributor</span>
                      <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{selectedIncome.donor_name}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Original Date</span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedIncome.income_date}</div>
                    </div>

                    {/* Arrow */}
                    <div style={{ color: 'var(--text-muted)', padding: '0 0.25rem' }}>
                      <ArrowRight size={16} />
                    </div>

                    {/* Right (Proposed) */}
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 600 }}>Proposed Amount</span>
                      <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>₹{selectedIncome.pending_update.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 600 }}>Proposed Contributor</span>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{selectedIncome.pending_update.donor_name}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 600 }}>Proposed Date</span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>{selectedIncome.pending_update.income_date}</div>
                    </div>
                  </div>
                </div>
              ) : (
                // Standard view for new additions or deletions
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Amount</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-success)' }}>
                      ₹{selectedIncome.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Donor / Contributor</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>{selectedIncome.donor_name}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Income Date</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {new Date(selectedIncome.income_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date Logged</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(selectedIncome.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={() => setSelectedIncome(null)}
              style={{ width: '100%', marginTop: '1.5rem', height: '42px' }}
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 600px) {
          .notif-actions-desktop {
            display: none !important;
          }
          .notif-actions-mobile {
            display: flex !important;
          }
          .notif-card {
            padding: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
};

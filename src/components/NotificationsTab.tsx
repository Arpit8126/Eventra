import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Bell, BellOff, ArrowLeft } from 'lucide-react';
import type { EventNotification, Profile } from '../types';

interface NotificationsTabProps {
  eventId: string;
  onClose: () => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ eventId, onClose }) => {
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User session not found.');

        // 1. Check if user is event creator
        const { data: eventData, error: eventErr } = await supabase
          .from('events')
          .select('creator_id')
          .eq('id', eventId)
          .single();
        
        if (eventErr) throw eventErr;
        const creatorCheck = eventData?.creator_id === user.id;
        setIsCreator(creatorCheck);

        // 2. Fetch notifications (Supabase RLS automatically filters this based on role)
        const { data: notifData, error: notifErr } = await supabase
          .from('event_notifications')
          .select('*')
          .eq('event_id', eventId)
          .order('created_at', { ascending: false });

        if (notifErr) throw notifErr;
        const fetchedNotifs = (notifData || []) as EventNotification[];
        setNotifications(fetchedNotifs);

        // 3. If creator, fetch profiles of members to show who received each notification
        if (creatorCheck && fetchedNotifs.length > 0) {
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
        }
      } catch (err: any) {
        console.error('Error fetching event notifications:', err);
        setErrorMsg(err.message || 'Failed to load notifications.');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [eventId]);

  return (
    <div className="notifications-page-container" style={{ padding: '1.5rem 1rem 5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          className="back-btn" 
          onClick={onClose} 
          title="Back to Event Details"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-item)', border: '1px solid var(--border-color)', borderRadius: '50%', padding: '0.6rem' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={22} style={{ color: 'var(--color-primary)' }} />
            Event Notifications
          </h2>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {isCreator ? "System activity feed and notification history for all members." : "Personal notifications and activity regarding your contributions."}
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
              Notifications will appear here when internal funds are added or updated.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notifications.map((notif) => {
            const recipient = profiles[notif.member_id];
            
            return (
              <div 
                key={notif.id} 
                style={{
                  background: 'var(--bg-item)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  cursor: 'default'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ 
                      background: 'rgba(255, 56, 92, 0.1)', 
                      borderRadius: '50%', 
                      padding: '0.45rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                      marginTop: '0.1rem'
                    }}>
                      <Bell size={15} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-main)', lineHeight: '1.4', fontWeight: 500 }}>
                        {notif.message}
                      </p>
                      
                      {isCreator && recipient && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          <span>Recipient:</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{recipient.full_name}</span>
                          <span>({recipient.email})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(notif.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(notif.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

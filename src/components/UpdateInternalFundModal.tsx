import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

interface UpdateInternalFundModalProps {
  eventId: string;
  currentFund: number;
  onClose: () => void;
  onUpdate: () => void;
}

export const UpdateInternalFundModal: React.FC<UpdateInternalFundModalProps> = ({
  eventId,
  currentFund,
  onClose,
  onUpdate,
}) => {
  const [amount, setAmount] = useState<string>(currentFund.toString());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newAmount = parseFloat(amount);
    
    if (isNaN(newAmount) || newAmount < 0) {
      setErrorMsg('Please enter a valid non-negative amount.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('events')
        .update({ internal_fund: newAmount })
        .eq('id', eventId);

      if (error) throw error;
      onUpdate();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update internal fund.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <h3>Update Internal Fund</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          By default, internal funds represent resources collected directly from organization members. 
          Updating this value adjusts the total event budget directly.
        </p>

        {errorMsg && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label">Current Internal Fund: ₹{currentFund.toLocaleString()}</label>
            <div className="input-wrapper">
              <span style={{ position: 'absolute', left: '1.1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem' }}>₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Enter new internal fund amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Updating...
                </>
              ) : 'Update Fund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

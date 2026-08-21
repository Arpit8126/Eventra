export interface Profile {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface Event {
  id: string;
  name: string;
  creator_id: string;
  internal_fund: number;
  created_at: string;
  creator_name?: string;
  creator_email?: string;
  total_fund?: number;
  total_expenses?: number;
  available_fund?: number;
}

export interface EventMember {
  id: string;
  event_id: string;
  member_id: string;
  created_at: string;
  member_name?: string;
  member_email?: string;
}

export interface Expense {
  id: string;
  event_id: string;
  added_by: string;
  amount: number;
  expense_date: string;
  purpose: string;
  is_updated: boolean;
  created_at: string;
  added_by_name?: string;
  added_by_email?: string;
}

export interface Income {
  id: string;
  event_id: string;
  added_by: string;
  amount: number;
  donor_name: string;
  income_date: string;
  is_updated: boolean;
  created_at: string;
  added_by_name?: string;
  added_by_email?: string;
}

export interface AuditLog {
  id: string;
  event_id: string;
  action_type: 'DELETE_EXPENSE' | 'DELETE_INCOME' | 'UPDATE_INTERNAL_FUND' | 'UPDATE_EXPENSE' | 'UPDATE_INCOME';
  performed_by: string;
  details: any;
  created_at: string;
  performed_by_name?: string;
  performed_by_email?: string;
}

export interface InternalFundContribution {
  id: string;
  event_id: string;
  member_id: string;
  amount: number;
  added_by: string;
  created_at: string;
  member_name?: string;
  member_email?: string;
}

export interface EventNotification {
  id: string;
  event_id: string;
  member_id: string;
  message: string;
  created_at: string;
}


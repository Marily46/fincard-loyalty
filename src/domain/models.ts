export interface TransactionRow {
  transaction_id: string;
  member_id: string;
  partner_id: string;
  points_earned: number;
  points_redeemed: number;
  transaction_date: string; // YYYY-MM-DD
  partner_name: string;
}

export interface StoredTransaction extends TransactionRow {
  processed_at: string; // ISO-8601
  batch_id: string;
}

export type BusinessRule = 'RN-01' | 'RN-02' | 'RN-03' | 'RN-04';

export interface FlaggedTransaction extends StoredTransaction {
  rule: BusinessRule;
  flag_reason: string;
}

export interface RowError {
  row: number; // 1-based, sin contar el header
  errors: string[];
}

export interface Manifest {
  batch_id: string;
  original_filename: string;
  sha256: string;
  processed_at: string;
  total_valid_rows: number;
  total_rejected_rows: number;
  total_flagged_rows: number;
  errors: RowError[];
}

export interface DailyBreakdownEntry {
  date: string;
  transactions: number;
  points_earned: number;
  points_redeemed: number;
}

export interface Settlement {
  partner_id: string;
  partner_name: string;
  period: { from: string; to: string };
  summary: {
    total_transactions: number;
    total_points_earned: number;
    total_points_redeemed: number;
    net_points_owed: number;
    unique_members: number;
  };
  daily_breakdown: DailyBreakdownEntry[];
}

export interface InvestorResult {
  name: string;
  type: "VC" | "PE" | "Angel" | "Family Office" | "SWF" | "Corporate" | string;
  chequeSize: string;
  sectorFocus: string[];
  geographicFocus: string;
  whyTheyFit: string;
  outreachAngle: string;
  fundActivity: "Recently Active" | "Active" | "Quiet" | "Unknown";
  sourceLinks?: string[];
}

export interface RaiseResult {
  companySummary: string;
  companyName: string;
  sector: string;
  stage: string;
  amount: string;
  geography: string;
  investors: InvestorResult[];
}

export interface DealSignal {
  text: string;
  found: boolean;
  source?: string;
}

export interface LikelyAcquirer {
  name: string;
  type: "Strategic" | "Financial" | string;
  rationale: string;
  dealStructure: string;
  precedentTransaction: string;
  likelihood: "High" | "Medium" | "Low";
}

export interface Financials {
  revenue?: string;
  ebitdaMargin?: string;
  revenueGrowth?: string;
  keyMetrics?: string;
  evRange?: string;
  source?: string;
  sourceUrl?: string;
  filingDate?: string;
}

export interface DealResult {
  companyName: string;
  sector: string;
  dealType: string;
  signalStrength: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  dataConfidence: "High" | "Medium" | "Low";
  lastUpdated: string;
  signals: DealSignal[];
  financials?: Financials;
  likelyAcquirers: LikelyAcquirer[];
  mandateBrief: string;
}

export interface WatchlistItem {
  id: string;
  user_session: string;
  company_name: string;
  deal_type: string;
  tool_type: "raise" | "deals";
  signal_strength: string;
  brief_data: RaiseResult | DealResult;
  created_at: string;
  updated_at: string;
  session_id: string;
  signal_changed?: boolean;
}

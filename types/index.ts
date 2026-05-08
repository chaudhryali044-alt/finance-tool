export interface InvestorResult {
  name: string;
  type: "VC" | "PE" | "Angel" | "Family Office" | "SWF" | "Corporate" | string;
  chequeSize: string;
  sectorFocus: string[];
  geographicFocus: string;
  whyTheyFit: string;
  outreachAngle: string;
  fundActivity: "Recently Active" | "Active" | "Quiet" | "Unknown";
  recentSignal?: string | null;
  fundStatus?: "Raising" | "Deploying" | "Harvesting" | "Unknown";
  sourceLinks?: string[];
}

export interface SearchSource {
  title: string;
  url: string;
  category: string;
  snippet?: string;
}

export interface RawSignal {
  headline: string;
  url: string;
  category: string;
  snippet?: string;
}

export type TaskStatus = "success" | "rate_limited" | "token_limit" | "unavailable";

export interface ModelContribution {
  task: "strategic" | "financial" | "market";
  displayName: string;
  model: string;
  status: TaskStatus;
}

export interface AnalysisMeta {
  // Core
  modelUsed: string;
  generatedAt: string;
  sourceCount: number;
  searchCount: number;
  dataConfidence: "High" | "Medium" | "Low";
  sources: SearchSource[];
  rawSignals: RawSignal[];
  // Triangulation
  contributions?: ModelContribution[];
  synthesisModel?: string;
  synthesisFallback?: boolean;
  analysisQuality?: "Full" | "Partial" | "Degraded";
}

export interface ComparableRaise {
  companyName: string;
  amount: string;
  stage: string;
  sector: string;
  geography: string;
  date: string;
  keyInvestors: string;
  sourceUrl: string;
}

export interface PitchPositioningItem {
  investorType: string;
  howToFrame: string;
  keyMetrics: string[];
  whatToAvoid: string;
  idealIntro: string;
}

export interface RaiseResult {
  companyName: string;
  sector: string;
  stage: string;
  amount: string;
  geography: string;
  companySummary: string;
  investors: InvestorResult[];
  comparableRaises?: ComparableRaise[];
  pitchPositioning?: PitchPositioningItem[];
  degradedNote?: string | null;
  meta?: AnalysisMeta;
}

export interface DealSignal {
  text: string;
  found: boolean;
  source?: string;
  category?: string;
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
  revenue?: string | null;
  ebitdaMargin?: string | null;
  revenueGrowth?: string | null;
  keyMetrics?: string | null;
  evRange?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
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
  financials?: Financials | null;
  likelyAcquirers: LikelyAcquirer[];
  mandateBrief: string;
  degradedNote?: string | null;
  meta?: AnalysisMeta;
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

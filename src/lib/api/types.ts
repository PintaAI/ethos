export type Io = "Income" | "Expenses";

export type BudgetPeriod = "daily" | "weekly" | "monthly" | "yearly";

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type ServerManagement = {
  id: string;
  name: string;
  image: string | null;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ServerManagementMember = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

export type ServerManagementInvite = {
  code: string;
};

export type ServerManagementImageUpdate = {
  status: "success";
  message: string;
  management: {
    id: string;
    image: string | null;
    imageTheme: unknown;
  };
};

export type ServerCurrentManagement = {
  management: ServerManagement & {
    members: ServerManagementMember[];
  };
  role: string;
};

export type ServerCategory = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  budgetDaily: number | null;
  budgetWeekly: number | null;
  budgetMonthly: number | null;
  budgetYearly: number | null;
  managementId: string;
  createdAt: string;
  updatedAt?: string;
};

export type ServerQuickFill = {
  id: string;
  name: string;
  nominal: number | null;
  categoryId: string | null;
  managementId: string;
  createdAt: string;
  updatedAt?: string;
};

export type ServerOverallBudget = {
  id: string;
  managementId: string;
  period: BudgetPeriod;
  amount: number;
  createdAt: string;
  updatedAt?: string;
};

export type ServerRecurringEntry = {
  id: string;
  name: string;
  nominal: number;
  io: Io;
  frequency: RecurringFrequency;
  startDate: string;
  categoryId: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  endDate: string | null;
  lastGenerated: string | null;
  managementId: string;
  createdAt: string;
  updatedAt?: string;
};

export type ServerEntry = {
  id: string;
  name: string;
  nominal: number;
  originalNominal: number | null;
  originalCurrency: string | null;
  exchangeRateToIdr: number | null;
  exchangeRateAt: string | null;
  category: string | null;
  date: string | null;
  io: Io | null;
  createdById: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type EntriesListResponse = {
  entries: ServerEntry[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CreateEntryBody = {
  name: string;
  nominal: number;
  io?: Io;
  category?: string;
  date?: string;
  originalNominal?: number;
  originalCurrency?: string;
  exchangeRateToIdr?: number;
  exchangeRateAt?: string;
  managementId?: string;
};

export type UpdateEntryBody = Partial<CreateEntryBody>;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ApiAccount {
  id: string;
  name: string;
  type: 'CREDIT_CARD' | 'CHECKING_ACCOUNT';
}

export interface ApiContact {
  id: string;
  name: string;
}

export interface ApiTransaction {
  id: string;
  type: 'despesa' | 'receita';
  amount: number;
  description: string;
  category: string;
  date: string;
  is_recurring: boolean;
  is_paid: boolean;
  current_installment?: number | null;
  total_installments?: number | null;
  asset_value?: number | null;
  installment_group_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  // Aliases for component convenience:
  tipo: 'despesa' | 'receita';
  valor: number;
  descricao: string;
  categoria: string;
  data: string;
  parcela?: number;
  totalParcelas?: number;
  valorBem?: number;
  grupoParcelasId?: string;
  expense_owner: 'Terceiros' | 'Próprio';
}

export interface DashboardSummaryResponse {
  month: string;
  current_balance: number;
  total_income_all_time: number;
  total_expenses_all_time: number;
  monthly: {
    personal_expenses: number;
    third_party_pending: number;
    third_party_total: number;
    total_expenses: number;
    total_income: number;
    balance: number;
  };
  categories: Array<{
    categoria: string;
    total: number;
  }>;
  history: Array<{
    month: string;
    income: number;
    expense: number;
  }>;
}

export interface ThirdPartyContactSummary {
  id: string;
  name: string;
  total_a_receber_geral: number;
  total_a_receber_mes: number;
  total_pago_historico: number;
  total_geral: number;
  total_transacoes: number;
}

export interface ThirdPartySummaryResponse {
  month: string;
  total_a_receber_geral: number;
  total_a_receber_mes: number;
  contacts: ThirdPartyContactSummary[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${errorBody || response.statusText}`);
  }

  return response.json();
}

export const api = {
  // Accounts
  async getAccounts(): Promise<ApiAccount[]> {
    return request<ApiAccount[]>('/api/accounts');
  },
  async createAccount(account: { id?: string; name: string; type: string }): Promise<ApiAccount> {
    return request<ApiAccount>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(account),
    });
  },
  async updateAccount(id: string, account: Partial<ApiAccount>): Promise<ApiAccount> {
    return request<ApiAccount>(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(account),
    });
  },
  async deleteAccount(id: string): Promise<{ success: boolean; id: string }> {
    return request<{ success: boolean; id: string }>(`/api/accounts/${id}`, {
      method: 'DELETE',
    });
  },

  // Contacts
  async getContacts(): Promise<ApiContact[]> {
    return request<ApiContact[]>('/api/contacts');
  },
  async createContact(contact: { id?: string; name: string }): Promise<ApiContact> {
    return request<ApiContact>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(contact),
    });
  },
  async updateContact(id: string, contact: { name: string }): Promise<ApiContact> {
    return request<ApiContact>(`/api/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contact),
    });
  },
  async deleteContact(id: string): Promise<{ success: boolean; id: string }> {
    return request<{ success: boolean; id: string }>(`/api/contacts/${id}`, {
      method: 'DELETE',
    });
  },

  // Transactions
  async getTransactions(params?: {
    month?: string;
    contact_id?: string;
    account_id?: string;
    category?: string;
    is_paid?: number;
  }): Promise<ApiTransaction[]> {
    const query = new URLSearchParams();
    if (params?.month) query.set('month', params.month);
    if (params?.contact_id) query.set('contact_id', params.contact_id);
    if (params?.account_id) query.set('account_id', params.account_id);
    if (params?.category) query.set('category', params.category);
    if (params?.is_paid !== undefined) query.set('is_paid', String(params.is_paid));
    const qs = query.toString();
    return request<ApiTransaction[]>(`/api/transactions${qs ? `?${qs}` : ''}`);
  },

  async createTransactions(items: any[] | any): Promise<ApiTransaction | ApiTransaction[]> {
    return request<ApiTransaction | ApiTransaction[]>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(items),
    });
  },

  async updateTransaction(id: string, patch: any): Promise<ApiTransaction> {
    return request<ApiTransaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async deleteTransaction(id: string): Promise<{ success: boolean; id: string }> {
    return request<{ success: boolean; id: string }>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  },

    async updateTransactionGroup(groupId: string, patch: any): Promise<ApiTransaction[]> {
    return request<ApiTransaction[]>('/api/transactions/group/' + groupId, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },
  async deleteTransactionGroup(groupId: string): Promise<{ success: boolean; changes: number }> {
    return request<{ success: boolean; changes: number }>(`/api/transactions/group/${groupId}`, {
      method: 'DELETE',
    });
  },

  async togglePaid(id: string): Promise<ApiTransaction> {
    return request<ApiTransaction>(`/api/transactions/${id}/toggle-paid`, {
      method: 'PATCH',
    });
  },

  async toggleRecurring(id: string): Promise<ApiTransaction> {
    return request<ApiTransaction>(`/api/transactions/${id}/toggle-recurring`, {
      method: 'PATCH',
    });
  },

  async processRecurring(): Promise<{ success: boolean; processedCount: number; items: ApiTransaction[] }> {
    return request<{ success: boolean; processedCount: number; items: ApiTransaction[] }>(
      '/api/transactions/process-recurring',
      { method: 'POST' }
    );
  },

  // Dedicated SQL aggregated summaries
  async getDashboardSummary(month?: string): Promise<DashboardSummaryResponse> {
    const qs = month ? `?month=${month}` : '';
    return request<DashboardSummaryResponse>(`/api/dashboard/summary${qs}`);
  },

  async getThirdPartySummary(month?: string): Promise<ThirdPartySummaryResponse> {
    const qs = month ? `?month=${month}` : '';
    return request<ThirdPartySummaryResponse>(`/api/third-party/summary${qs}`);
  },

  // Reset database (Danger Zone)
  async resetDatabase(): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/api/database/reset', {
      method: 'DELETE',
    });
  },
};

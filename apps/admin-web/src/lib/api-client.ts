const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.message || response.statusText,
      errorData
    );
  }
  try {
    return await response.json();
  } catch {
    return null as unknown as T;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = localStorage.getItem("transmetro_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchWithAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(await getAuthHeaders()),
      ...options.headers,
    },
  });
  return handleResponse<T>(response);
}

export const apiClient = {
  async get<T>(path: string): Promise<T> {
    return fetchWithAuth<T>(path);
  },

  async post<T>(path: string, data: any): Promise<T> {
    return fetchWithAuth<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async patch<T>(path: string, data: any): Promise<T> {
    return fetchWithAuth<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete<T>(path: string): Promise<T> {
    return fetchWithAuth<T>(path, {
      method: 'DELETE',
    });
  },
};

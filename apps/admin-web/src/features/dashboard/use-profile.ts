import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';

export interface ProfileData {
  employeeId: string;
  name: string;
  email: string;
  role: { code: string; name: string };
  station?: { idEstacion: string; nombreEstacion: string };
  line?: { idLinea: string; numeroLinea: string; nombreLinea: string; colorHex: string };
  licenseNumber?: string | null;
}

export interface UseProfileResult {
  profile: ProfileData | null;
  loading: boolean;
  error: string | null;
}

/** Own profile: identity comes from the token. */
export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ProfileData>('/profile')
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el perfil');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, loading, error };
}

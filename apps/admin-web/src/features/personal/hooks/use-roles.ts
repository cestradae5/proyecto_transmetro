import { useState, useEffect } from "react";
import { apiClient } from "../../../lib/api-client";
import type { PersonalRole } from "../types/personal.types";
import { getPersonalErrorMessage } from "./personal-errors";

export interface UseRolesResult {
  roles: PersonalRole[];
  loading: boolean;
  error: string | null;
}

export function useRoles(): UseRolesResult {
  const [roles, setRoles] = useState<PersonalRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<PersonalRole[]>("/personal/roles")
      .then((data) => {
        if (!cancelled) setRoles(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getPersonalErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { roles, loading, error };
}

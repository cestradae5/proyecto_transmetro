export type EmployeeStatus = "ACTIVO" | "INACTIVO";

/** Employee as returned by `GET /personal/empleados`. */
export interface Empleado {
  id: string;
  name: string;
  email: string;
  status: EmployeeStatus;
  roleId: string;
  roleCode: string;
  roleName: string;
  phone: string | null;
  dpi: string | null;
  hireDate: string | null;
  address: string | null;
  licenseNumber: string | null;
  educationHistory: string | null;
  languages: string | null;
}

/** Payload for creating an employee. */
export interface CreateEmpleadoPayload {
  name: string;
  email: string;
  roleId: string;
  dpi: string;
  status?: EmployeeStatus;
  phone?: string;
  hireDate?: string;
  address?: string;
  licenseNumber?: string;
  educationHistory?: string;
  languages?: string;
}

/** Payload for updating an employee: every field is optional. The DPI is never cleared. */
export type UpdateEmpleadoPayload = Partial<CreateEmpleadoPayload>;

/** Create and update payload (update = partial). */
export type EmpleadoPayload = CreateEmpleadoPayload | UpdateEmpleadoPayload;

export interface EmpleadoFilters {
  search?: string;
  status?: EmployeeStatus;
  roleId?: string;
}

export interface PersonalRole {
  id: string;
  code: string;
  name: string;
}

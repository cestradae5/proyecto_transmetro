import { useId, useState } from "react";
import type {
  CreateEmpleadoPayload,
  Empleado,
  EmployeeStatus,
  PersonalRole,
  UpdateEmpleadoPayload,
} from "../../types/personal.types";

interface EmpleadoFormProps {
  /** When present the form edits this employee; otherwise it creates one. */
  empleado?: Empleado;
  roles: PersonalRole[];
  onSubmit: (payload: CreateEmpleadoPayload | UpdateEmpleadoPayload) => Promise<unknown>;
  onCancel: () => void;
}

const INPUT_CLASS =
  "w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 mb-1";
const ERROR_CLASS = "text-red-600 text-xs mt-1";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type FormState = {
  name: string;
  email: string;
  roleId: string;
  dpi: string;
  status: EmployeeStatus;
  phone: string;
  hireDate: string;
  address: string;
  licenseNumber: string;
  educationHistory: string;
  languages: string;
};

type OptionalField = "phone" | "hireDate" | "address" | "licenseNumber" | "educationHistory" | "languages";

const OPTIONAL_FIELDS: OptionalField[] = [
  "phone",
  "hireDate",
  "address",
  "licenseNumber",
  "educationHistory",
  "languages",
];

function toFormState(empleado?: Empleado): FormState {
  return {
    name: empleado?.name ?? "",
    email: empleado?.email ?? "",
    roleId: empleado?.roleId ?? "",
    dpi: empleado?.dpi ?? "",
    status: empleado?.status ?? "ACTIVO",
    phone: empleado?.phone ?? "",
    // The input needs YYYY-MM-DD even if the API ever returns a full timestamp.
    hireDate: empleado?.hireDate?.slice(0, 10) ?? "",
    address: empleado?.address ?? "",
    licenseNumber: empleado?.licenseNumber ?? "",
    educationHistory: empleado?.educationHistory ?? "",
    languages: empleado?.languages ?? "",
  };
}

function isRealDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function EmpleadoForm({ empleado, roles, onSubmit, onCancel }: EmpleadoFormProps) {
  const isEdit = !!empleado;
  const uid = useId();
  const [formData, setFormData] = useState<FormState>(() => toFormState(empleado));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const id = (name: string) => `${uid}-${name}`;
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  // An employee whose role is no longer active is absent from the roles list:
  // keep it selectable so the untouched value is not silently replaced.
  const roleOptions =
    empleado && empleado.roleId && !roles.some((r) => r.id === empleado.roleId)
      ? [...roles, { id: empleado.roleId, code: empleado.roleCode, name: empleado.roleName }]
      : roles;

  const validate = () => {
    const newErrors: Record<string, string> = {};

    const name = formData.name.trim();
    if (!name) newErrors.name = "El nombre es requerido";
    else if (name.length > 120) newErrors.name = "El nombre no puede exceder 120 caracteres";

    const email = formData.email.trim();
    if (!email) newErrors.email = "El correo es requerido";
    else if (email.length > 254) newErrors.email = "El correo no puede exceder 254 caracteres";
    else if (!EMAIL_REGEX.test(email)) newErrors.email = "El correo no tiene un formato válido";

    if (!formData.roleId) newErrors.roleId = "El rol es requerido";

    if (!formData.dpi) newErrors.dpi = "El DPI es requerido";
    else if (!/^\d{13}$/.test(formData.dpi)) newErrors.dpi = "El DPI debe tener exactamente 13 dígitos";

    const phone = formData.phone.trim();
    if (phone && !PHONE_REGEX.test(phone)) {
      newErrors.phone = "El teléfono debe tener entre 7 y 20 caracteres (números, +, -, paréntesis)";
    }

    if (formData.hireDate && !isRealDate(formData.hireDate)) {
      newErrors.hireDate = "La fecha de ingreso no es válida";
    }

    if (formData.address.trim().length > 255) newErrors.address = "La dirección no puede exceder 255 caracteres";
    if (formData.licenseNumber.trim().length > 30) {
      newErrors.licenseNumber = "El número de licencia no puede exceder 30 caracteres";
    }
    if (formData.educationHistory.trim().length > 2000) {
      newErrors.educationHistory = "El historial educativo no puede exceder 2000 caracteres";
    }
    if (formData.languages.trim().length > 2000) {
      newErrors.languages = "Los idiomas no pueden exceder 2000 caracteres";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildPayload = (): CreateEmpleadoPayload | UpdateEmpleadoPayload => {
    const payload: UpdateEmpleadoPayload = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      roleId: formData.roleId,
      dpi: formData.dpi,
      status: formData.status,
    };

    for (const field of OPTIONAL_FIELDS) {
      const value = formData[field].trim();
      if (value) {
        payload[field] = value;
      } else if (isEdit && empleado?.[field]) {
        // Clearing a stored optional value: the PATCH DTO lets an explicit `null`
        // through (`@IsOptional`) and the service writes it to the nullable column.
        // An empty string would be rejected for `phone` and `hireDate` (regex) and
        // stored as "" (not null) for the free-text fields, so `null` is used.
        // Note: this relies on implicit API behaviour (not documented in Swagger).
        payload[field] = null;
      }
      // Empty and previously empty: omit the field.
    }
    return payload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(buildPayload());
    } catch (error: unknown) {
      setErrors({ submit: error instanceof Error && error.message ? error.message : "Error al guardar" });
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? <p className={ERROR_CLASS}>{errors[name]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={id("name")} className={LABEL_CLASS}>Nombre *</label>
        <input id={id("name")} type="text" value={formData.name} onChange={(e) => setField("name", e.target.value)} className={INPUT_CLASS} />
        {fieldError("name")}
      </div>

      <div>
        <label htmlFor={id("email")} className={LABEL_CLASS}>Correo *</label>
        <input id={id("email")} type="email" value={formData.email} onChange={(e) => setField("email", e.target.value)} className={INPUT_CLASS} />
        {fieldError("email")}
      </div>

      <div>
        <label htmlFor={id("roleId")} className={LABEL_CLASS}>Rol *</label>
        <select id={id("roleId")} value={formData.roleId} onChange={(e) => setField("roleId", e.target.value)} className={INPUT_CLASS}>
          <option value="">Seleccione un rol</option>
          {roleOptions.map((role) => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </select>
        {fieldError("roleId")}
      </div>

      <div>
        <label htmlFor={id("dpi")} className={LABEL_CLASS}>DPI *</label>
        <input
          id={id("dpi")}
          type="text"
          inputMode="numeric"
          maxLength={13}
          value={formData.dpi}
          // Non-digits are dropped as the user types so the value is always digits-only.
          onChange={(e) => setField("dpi", e.target.value.replace(/\D/g, ""))}
          className={INPUT_CLASS}
          placeholder="13 dígitos"
        />
        {fieldError("dpi")}
      </div>

      <div>
        <label htmlFor={id("status")} className={LABEL_CLASS}>Estado *</label>
        <select id={id("status")} value={formData.status} onChange={(e) => setField("status", e.target.value as EmployeeStatus)} className={INPUT_CLASS}>
          <option value="ACTIVO">Activo</option>
          <option value="INACTIVO">Inactivo</option>
        </select>
      </div>

      <div>
        <label htmlFor={id("phone")} className={LABEL_CLASS}>Teléfono</label>
        <input id={id("phone")} type="tel" value={formData.phone} onChange={(e) => setField("phone", e.target.value)} className={INPUT_CLASS} placeholder="ej: +502 5555-1234" />
        {fieldError("phone")}
      </div>

      <div>
        <label htmlFor={id("hireDate")} className={LABEL_CLASS}>Fecha de ingreso</label>
        <input id={id("hireDate")} type="date" value={formData.hireDate} onChange={(e) => setField("hireDate", e.target.value)} className={INPUT_CLASS} />
        {fieldError("hireDate")}
      </div>

      <div>
        <label htmlFor={id("address")} className={LABEL_CLASS}>Dirección</label>
        <input id={id("address")} type="text" value={formData.address} onChange={(e) => setField("address", e.target.value)} className={INPUT_CLASS} />
        {fieldError("address")}
      </div>

      <div>
        <label htmlFor={id("licenseNumber")} className={LABEL_CLASS}>Número de licencia</label>
        <input id={id("licenseNumber")} type="text" value={formData.licenseNumber} onChange={(e) => setField("licenseNumber", e.target.value)} className={INPUT_CLASS} />
        {fieldError("licenseNumber")}
      </div>

      <div>
        <label htmlFor={id("educationHistory")} className={LABEL_CLASS}>Historial educativo</label>
        <textarea id={id("educationHistory")} rows={3} value={formData.educationHistory} onChange={(e) => setField("educationHistory", e.target.value)} className={INPUT_CLASS} />
        {fieldError("educationHistory")}
      </div>

      <div>
        <label htmlFor={id("languages")} className={LABEL_CLASS}>Idiomas</label>
        <textarea id={id("languages")} rows={3} value={formData.languages} onChange={(e) => setField("languages", e.target.value)} className={INPUT_CLASS} />
        {fieldError("languages")}
      </div>

      {errors.submit && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errors.submit}</div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">{submitting ? "Guardando..." : "Guardar"}</button>
      </div>
    </form>
  );
}

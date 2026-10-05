import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmpleadoForm } from "../../features/personal/components/empleados/empleado-form";
import type { Empleado, PersonalRole } from "../../features/personal/types/personal.types";

const ROLES: PersonalRole[] = [
  { id: "1", code: "OPERADOR_CENTRAL", name: "Operador Central" },
  { id: "2", code: "PILOTO", name: "Piloto" },
];

const SAMPLE: Empleado = {
  id: "9",
  name: "Ana López",
  email: "ana@transmetro.test",
  status: "INACTIVO",
  roleId: "2",
  roleCode: "PILOTO",
  roleName: "Piloto",
  phone: "+502 5555-1234",
  dpi: "1234567890123",
  hireDate: "2024-03-05",
  address: "Zona 1",
  licenseNumber: null,
  educationHistory: null,
  languages: null,
};

function renderForm(empleado?: Empleado, onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onCancel = vi.fn();
  render(<EmpleadoForm empleado={empleado} roles={ROLES} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
}

function change(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValid() {
  change(/Nombre/, "  Carlos Ruiz ");
  change(/Correo/, " Carlos@Transmetro.TEST ");
  change(/Rol/, "1");
  change(/DPI/, "2456789012301");
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

describe("EmpleadoForm", () => {
  it("shows required errors and does not submit when empty", async () => {
    const { onSubmit } = renderForm();
    save();

    expect(await screen.findByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("El correo es requerido")).toBeInTheDocument();
    expect(screen.getByText("El rol es requerido")).toBeInTheDocument();
    expect(screen.getByText("El DPI es requerido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("strips non-digits from the DPI as the user types", () => {
    renderForm();
    change(/DPI/, "24a5-67 89");
    expect(screen.getByLabelText(/DPI/)).toHaveValue("2456789");
  });

  it("requires the DPI to have exactly 13 digits", async () => {
    const { onSubmit } = renderForm();
    fillValid();
    change(/DPI/, "123456789012");
    save();
    expect(await screen.findByText("El DPI debe tener exactamente 13 dígitos")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an invalid email format", async () => {
    const { onSubmit } = renderForm();
    fillValid();
    change(/Correo/, "not-an-email");
    save();
    expect(await screen.findByText("El correo no tiene un formato válido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates the phone with the API regex", async () => {
    const { onSubmit } = renderForm();
    fillValid();
    change(/Teléfono/, "abc1234");
    save();
    expect(await screen.findByText(/El teléfono debe tener entre 7 y 20/)).toBeInTheDocument();
    change(/Teléfono/, "123456");
    save();
    expect(await screen.findByText(/El teléfono debe tener entre 7 y 20/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates max lengths", async () => {
    const { onSubmit } = renderForm();
    fillValid();
    change(/Nombre/, "x".repeat(121));
    change(/Dirección/, "x".repeat(256));
    change(/Número de licencia/, "x".repeat(31));
    change(/Historial educativo/, "x".repeat(2001));
    change(/Idiomas/, "x".repeat(2001));
    save();
    expect(await screen.findByText("El nombre no puede exceder 120 caracteres")).toBeInTheDocument();
    expect(screen.getByText("La dirección no puede exceder 255 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El número de licencia no puede exceder 30 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El historial educativo no puede exceder 2000 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Los idiomas no pueden exceder 2000 caracteres")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("omits empty optional fields and normalises required ones on create", async () => {
    const { onSubmit } = renderForm();
    fillValid();
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Carlos Ruiz",
      email: "carlos@transmetro.test",
      roleId: "1",
      dpi: "2456789012301",
      status: "ACTIVO",
    });
  });

  it("includes filled optional fields, trimmed, on create", async () => {
    const { onSubmit } = renderForm();
    fillValid();
    change(/Estado/, "INACTIVO");
    change(/Teléfono/, " +502 5555-1234 ");
    change(/Fecha de ingreso/, "2024-03-15");
    change(/Dirección/, " Zona 10 ");
    change(/Número de licencia/, "LIC-1");
    change(/Historial educativo/, "Bachiller");
    change(/Idiomas/, "Español, Inglés");
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Carlos Ruiz",
      email: "carlos@transmetro.test",
      roleId: "1",
      dpi: "2456789012301",
      status: "INACTIVO",
      phone: "+502 5555-1234",
      hireDate: "2024-03-15",
      address: "Zona 10",
      licenseNumber: "LIC-1",
      educationHistory: "Bachiller",
      languages: "Español, Inglés",
    });
  });

  it("prefills in edit mode, keeping the DPI required", async () => {
    const { onSubmit } = renderForm(SAMPLE);
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("Ana López");
    expect(screen.getByLabelText(/Correo/)).toHaveValue("ana@transmetro.test");
    expect(screen.getByLabelText(/Rol/)).toHaveValue("2");
    expect(screen.getByLabelText(/DPI/)).toHaveValue("1234567890123");
    expect(screen.getByLabelText(/Estado/)).toHaveValue("INACTIVO");
    expect(screen.getByLabelText(/Fecha de ingreso/)).toHaveValue("2024-03-05");

    change(/DPI/, "");
    save();
    expect(await screen.findByText("El DPI es requerido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("on edit sends null for cleared optionals and omits ones that were already empty", async () => {
    const { onSubmit } = renderForm(SAMPLE);
    change(/Teléfono/, "");
    change(/Estado/, "ACTIVO");
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload).toEqual({
      name: "Ana López",
      email: "ana@transmetro.test",
      roleId: "2",
      dpi: "1234567890123",
      status: "ACTIVO",
      phone: null,
      hireDate: "2024-03-05",
      address: "Zona 1",
    });
    expect(payload).not.toHaveProperty("licenseNumber");
    expect(payload).not.toHaveProperty("languages");
  });

  it("keeps a role that is missing from the active roles selectable", () => {
    renderForm({ ...SAMPLE, roleId: "99", roleCode: "OLD", roleName: "Rol antiguo" });
    expect(screen.getByLabelText(/Rol/)).toHaveValue("99");
    expect(screen.getByRole("option", { name: "Rol antiguo" })).toBeInTheDocument();
  });

  it("disables the submit button while submitting", async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    renderForm(undefined, onSubmit);
    fillValid();
    save();

    const button = await screen.findByRole("button", { name: "Guardando..." });
    expect(button).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
  });

  it("shows the backend error message in an alert", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Ya existe un empleado con ese correo"));
    renderForm(undefined, onSubmit);
    fillValid();
    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ya existe un empleado con ese correo");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("calls onCancel", () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

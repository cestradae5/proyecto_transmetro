// Contratos compartidos del módulo fleet — sin lógica de negocio.

export interface AuditActor {
  employeeId: string;
}

export interface PilotScopeResult {
  employeeId: string;
  unitId: string;
}

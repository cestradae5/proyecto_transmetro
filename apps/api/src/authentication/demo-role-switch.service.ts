// Demo role switch for academic review: an allowlisted reviewer (logged in
// with their own Google account) can act as a representative employee of each
// role, so every role-scoped screen can be evaluated with a single account.
//
// Safety rails:
// - Off unless DEMO_ROLE_SWITCH_ENABLED=true AND the allowlist is non-empty.
// - Authorization is always checked against the REAL actor: the signed
//   `demoActor` claim while impersonating, the session email otherwise.
// - The actor must still be an eligible employee on every switch.
// - Every switch/restore is written to tbl_bitacora under the real actor.

import { Inject } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import {
  DemoPersonaNotFound,
  DemoRoleSwitchDisabled,
  DemoRoleSwitchForbidden,
  type DemoActor,
  type DemoPersonasResult,
  type LoginResult,
  type MeResult,
} from "./authentication.contracts.js";
import { issueEmployeeToken } from "./authentication.service.js";
import { AUDIT_RESULTS } from "./entities/audit-log.entity.js";
import type { EmployeeEntity } from "./entities/employee.entity.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import { DemoPersonaRepository } from "./infrastructure/demo-persona.repository.js";
import { EmployeeRepository } from "./infrastructure/employee.repository.js";
import { DATASOURCE } from "./infrastructure/google-credential-verifier.port.js";

export const DEMO_ROLE_SWITCH_CONFIG = Symbol("DEMO_ROLE_SWITCH_CONFIG");

export interface DemoRoleSwitchConfig {
  enabled: boolean;
  allowedEmails: string[];
}

export class DemoRoleSwitchService {
  constructor(
    @Inject(DATASOURCE)
    private readonly dataSource: DataSource,
    private readonly employeeRepo: EmployeeRepository,
    private readonly auditRepo: AuditRepository,
    private readonly personaRepo: DemoPersonaRepository,
    @Inject(DEMO_ROLE_SWITCH_CONFIG)
    private readonly config: DemoRoleSwitchConfig,
  ) {}

  async listPersonas(user: MeResult): Promise<DemoPersonasResult> {
    const actor = this.authorize(user);
    const personas = await this.personaRepo.findRepresentatives();
    const ownRole = await this.dataSource.transaction(async (manager) => {
      const actorEmployee = await this.loadActor(manager, actor);
      return actorEmployee.role.code;
    });

    return {
      actorEmail: actor.email,
      impersonating: user.demoActor !== undefined,
      activeEmployeeId: user.employeeId,
      personas: personas.filter((persona) => persona.roleCode !== ownRole),
    };
  }

  async switchTo(user: MeResult, roleCode: string): Promise<LoginResult> {
    const actor = this.authorize(user);
    const persona = (await this.personaRepo.findRepresentatives()).find(
      (candidate) => candidate.roleCode === roleCode,
    );
    if (!persona) {
      throw new DemoPersonaNotFound();
    }

    return this.dataSource.transaction(async (manager) => {
      const actorEmployee = await this.loadActor(manager, actor);
      const target = await this.employeeRepo.findEligibleById(manager, persona.employeeId);
      if (!target) {
        throw new DemoPersonaNotFound();
      }

      await this.audit(manager, "DEMO_ROLE_SWITCH", actorEmployee, target, roleCode);
      return issueEmployeeToken(target, { employeeId: actorEmployee.id, email: actorEmployee.email });
    });
  }

  async restore(user: MeResult): Promise<LoginResult> {
    const actor = this.authorize(user);

    return this.dataSource.transaction(async (manager) => {
      const actorEmployee = await this.loadActor(manager, actor);

      await this.audit(manager, "DEMO_ROLE_RESTORE", actorEmployee, actorEmployee, actorEmployee.role.code);
      return issueEmployeeToken(actorEmployee);
    });
  }

  private authorize(user: MeResult): DemoActor {
    const allowed = this.config.allowedEmails.map((email) => email.trim().toLowerCase());
    if (!this.config.enabled || allowed.length === 0) {
      throw new DemoRoleSwitchDisabled();
    }

    const actor = user.demoActor ?? { employeeId: user.employeeId, email: user.email };
    if (!allowed.includes(actor.email.trim().toLowerCase())) {
      throw new DemoRoleSwitchForbidden();
    }
    return actor;
  }

  // The real actor must still exist as an eligible employee with the same
  // email; a deactivated reviewer loses switch rights immediately.
  private async loadActor(manager: EntityManager, actor: DemoActor): Promise<EmployeeEntity> {
    const employee = await this.employeeRepo.findEligibleById(manager, actor.employeeId);
    if (!employee || employee.email.toLowerCase() !== actor.email.toLowerCase()) {
      throw new DemoRoleSwitchForbidden();
    }
    return employee;
  }

  private async audit(
    manager: EntityManager,
    action: "DEMO_ROLE_SWITCH" | "DEMO_ROLE_RESTORE",
    actor: EmployeeEntity,
    target: EmployeeEntity,
    roleCode: string,
  ): Promise<void> {
    await this.auditRepo.create(manager, {
      action,
      employee: actor,
      entityId: target.id,
      entityType: "employee",
      module: "authentication",
      result: AUDIT_RESULTS.SUCCESS,
      detalle: { roleCode, targetEmployeeId: target.id },
    });
  }
}

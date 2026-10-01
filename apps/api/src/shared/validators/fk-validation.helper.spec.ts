// Behavioral coverage for the relocated FK validator (design.md Decision 2):
// same contract as the legacy infra helper, now throwing the shared NotFoundError.

import { jest } from "@jest/globals";
import type { Repository } from "typeorm";

import { NotFoundError } from "../errors/domain-exception.filter.js";
import { validateForeignKey } from "./fk-validation.helper.js";

describe("validateForeignKey (shared)", () => {
  it("resolves without throwing when the referenced entity exists", async () => {
    const repo = {
      existsBy: jest.fn(async () => true),
    } as unknown as Repository<{ id: string }>;

    await expect(validateForeignKey(repo, "5", "Línea")).resolves.toBeUndefined();
    expect(repo.existsBy).toHaveBeenCalledWith({ id: "5" });
  });

  it("throws a shared NotFoundError naming the entity when the referenced row is absent", async () => {
    const repo = {
      existsBy: jest.fn(async () => false),
    } as unknown as Repository<{ id: string }>;

    await expect(validateForeignKey(repo, "99", "Línea")).rejects.toEqual(
      new NotFoundError("Línea con ID 99 no existe."),
    );
  });
});

// Behavioral coverage for the infrastructure FK validator.
//
// The validator's whole job is an existence check on the caller's primary key,
// so these tests pin three things: it resolves when the row exists, it throws a
// NotFoundException naming the *referenced* entity when it does not, and it
// spends exactly one query doing so. The single-query contract is the point —
// an earlier version ran `count` and then a redundant `findOne` with an identical
// `where`, which cost a second round trip on every rejected FK.

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";

import { validateForeignKey } from "./validators.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockRepository = {
  count: AnyMock;
  findOne: AnyMock;
};

function makeMockRepository(): MockRepository {
  return {
    count: jest.fn(async () => 1),
    // Any row is enough for an existence check; returning one proves the helper
    // never needs it.
    findOne: jest.fn(async () => ({ idParada: "5" })),
  };
}

function asRepository(repository: MockRepository): Repository<{ idParada: string }> {
  return repository as unknown as Repository<{ idParada: string }>;
}

describe("validateForeignKey (infrastructure/shared)", () => {
  it("resolves without throwing when the referenced row exists", async () => {
    const repository = makeMockRepository();

    await expect(
      validateForeignKey(asRepository(repository), "5", "idParada", "Parada")
    ).resolves.toBeUndefined();
  });

  it("queries once, on the caller-supplied primary key", async () => {
    const repository = makeMockRepository();

    await validateForeignKey(asRepository(repository), "5", "idParada", "Parada");

    expect(repository.count).toHaveBeenCalledTimes(1);
    expect(repository.count).toHaveBeenCalledWith({ where: { idParada: "5" } });
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it("spends a single query on the rejection path too", async () => {
    const repository = makeMockRepository();
    repository.count.mockResolvedValue(0);

    await expect(
      validateForeignKey(asRepository(repository), "99", "idParada", "Parada")
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.count).toHaveBeenCalledTimes(1);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it("throws a NotFoundException naming the referenced entity and the id", async () => {
    const repository = makeMockRepository();
    repository.count.mockResolvedValue(0);

    await expect(
      validateForeignKey(asRepository(repository), "99", "idParada", "Parada")
    ).rejects.toThrow(NotFoundException);
    await expect(
      validateForeignKey(asRepository(repository), "99", "idParada", "Parada")
    ).rejects.toThrow("Parada con ID 99 no encontrada");
  });

  it("uses each entity's real primary key instead of a literal 'id'", async () => {
    const repository = makeMockRepository();

    await validateForeignKey(asRepository(repository), "2", "idParqueo", "Parqueo");

    expect(repository.count).toHaveBeenCalledWith({ where: { idParqueo: "2" } });
    expect(repository.count).not.toHaveBeenCalledWith({ where: { id: "2" } });
  });

  it("reports the entity it was asked about, not a neighbouring one", async () => {
    const repository = makeMockRepository();
    repository.count.mockResolvedValue(0);

    // Same repository, different entity label: the message must follow the
    // `entityName` argument, never a hardcoded or borrowed entity.
    const error = await validateForeignKey(
      asRepository(repository),
      "99",
      "idEstacion",
      "Estación"
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe("Estación con ID 99 no encontrada");
  });

  it("accepts a numeric id without changing the reported value", async () => {
    const repository = makeMockRepository();
    repository.count.mockResolvedValue(0);

    const error = await validateForeignKey(
      asRepository(repository),
      99,
      "idEstacion",
      "Estación"
    ).catch((thrown: unknown) => thrown);

    expect((error as NotFoundException).message).toBe("Estación con ID 99 no encontrada");
  });
});
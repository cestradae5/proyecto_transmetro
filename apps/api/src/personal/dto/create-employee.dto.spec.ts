import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateEmployeeDto } from "./create-employee.dto.js";
import { UpdateEmployeeDto } from "./update-employee.dto.js";

const validPayload = {
  name: "  Maria Lopez ",
  email: "  Maria.Lopez@Transmetro.GT ",
  roleId: "2",
  dpi: "2456789012301",
};

async function failedProperties(
  payload: Record<string, unknown>,
  type: typeof CreateEmployeeDto | typeof UpdateEmployeeDto = CreateEmployeeDto,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, payload));
  return errors.map((error) => error.property);
}

describe("CreateEmployeeDto", () => {
  it("accepts a valid payload", async () => {
    expect(await failedProperties(validPayload)).toEqual([]);
  });

  it("trims the name and lowercases + trims the email", () => {
    const dto = plainToInstance(CreateEmployeeDto, validPayload);

    expect(dto.name).toBe("Maria Lopez");
    expect(dto.email).toBe("maria.lopez@transmetro.gt");
  });

  it("rejects a missing dpi", async () => {
    const { dpi: _dpi, ...payload } = validPayload;
    expect(await failedProperties(payload)).toContain("dpi");
  });

  it.each(["245678901230", "24567890123012", "24567890123ab", ""])(
    "rejects dpi %p",
    async (dpi) => {
      expect(await failedProperties({ ...validPayload, dpi })).toContain("dpi");
    },
  );

  it("rejects an invalid status and accepts a valid one", async () => {
    expect(await failedProperties({ ...validPayload, status: "BORRADO" })).toContain(
      "status",
    );
    expect(await failedProperties({ ...validPayload, status: "INACTIVO" })).toEqual([]);
  });

  it("rejects a non-numeric roleId and an invalid email", async () => {
    const failed = await failedProperties({
      ...validPayload,
      roleId: "abc",
      email: "not-an-email",
    });
    expect(failed).toEqual(expect.arrayContaining(["roleId", "email"]));
  });

  it("validates optional phone and hireDate formats", async () => {
    expect(
      await failedProperties({ ...validPayload, phone: "+502 5555-1234", hireDate: "2024-03-15" }),
    ).toEqual([]);
    expect(
      await failedProperties({ ...validPayload, phone: "abc", hireDate: "15/03/2024" }),
    ).toEqual(expect.arrayContaining(["phone", "hireDate"]));
  });
});

describe("UpdateEmployeeDto", () => {
  it("allows omitting dpi", async () => {
    expect(await failedProperties({ name: "Nuevo" }, UpdateEmployeeDto)).toEqual([]);
  });

  it.each(["", "123"])("never accepts dpi %p", async (dpi) => {
    expect(await failedProperties({ dpi }, UpdateEmployeeDto)).toContain("dpi");
  });
});

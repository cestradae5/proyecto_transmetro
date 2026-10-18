import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateParadaDto } from "./dto/update-parada.dto.js";

// odd/tasks/parada-ridership.md S3: PATCH accepts capacidadPasajeros >= 1; null -> 400.
describe("UpdateParadaDto capacidadPasajeros (parada-ridership S3)", () => {
  it("accepts an empty body and a positive integer", async () => {
    expect(await validate(plainToInstance(UpdateParadaDto, {}))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateParadaDto, { capacidadPasajeros: 1 }))).toHaveLength(0);
  });

  it.each([null, 0, 1.5, "4"])("rejects %p", async (capacidadPasajeros) => {
    const errors = await validate(plainToInstance(UpdateParadaDto, { capacidadPasajeros }));
    expect(errors.map((e) => e.property)).toEqual(["capacidadPasajeros"]);
  });
});

export interface ProfileRoleDto {
  code: string;
  name: string;
}

export interface ProfileStationDto {
  idEstacion: string;
  nombreEstacion: string;
}

export interface ProfileLineDto {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
}

export interface ProfileResponseDto {
  employeeId: string;
  name: string;
  email: string;
  role: ProfileRoleDto;
  station?: ProfileStationDto;
  line?: ProfileLineDto;
  // Pilots only: null when no license number is registered.
  licenseNumber?: string | null;
}

// src/dto/create-server.dto.ts
export class CreateServerDto {
  name: string;
  owner: number;
  members?: number[];
}

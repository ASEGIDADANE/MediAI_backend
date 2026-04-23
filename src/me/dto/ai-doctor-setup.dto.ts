import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PatchAiDoctorSetupDto {
  @ApiProperty()
  @IsBoolean()
  completed: boolean;
}

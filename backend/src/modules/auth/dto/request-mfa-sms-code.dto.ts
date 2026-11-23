import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RequestMfaSmsCodeDto {
  @ApiProperty({
    description: 'Temporary MFA token returned by the login endpoint',
  })
  @IsString()
  @IsNotEmpty()
  mfaToken: string;
}

import { IsArray, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class SeekRequestDto {
  @IsOptional()
  @IsUUID('4')
  participantId?: string;

  @IsInt()
  @Min(0)
  timestampMs!: number;
}

export class TargetRequestDto {
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds!: string[];

  @IsOptional()
  @IsUUID('4')
  participantId?: string;

  @IsInt()
  @Min(0)
  timestampMs!: number;
}

export class EndReplayDto {
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds!: string[];
}

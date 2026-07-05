import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateClipDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsInt()
  @Min(0)
  startMs!: number;

  @IsInt()
  @Min(0)
  endMs!: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds?: string[];
}

export class ShareClipDto {
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds!: string[];
}

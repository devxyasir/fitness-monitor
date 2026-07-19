import { IsString, Length } from 'class-validator';

/** Shared by AdminSessionsController's and AdminClipsController's hide
 * actions — an admin must give a reason, both for accountability (it's
 * recorded in the audit log and shown back on the row) and to avoid a
 * one-click accidental hide. */
export class HideContentDto {
  @IsString()
  @Length(1, 255)
  reason!: string;
}

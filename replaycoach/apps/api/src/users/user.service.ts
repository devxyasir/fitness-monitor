import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import * as argon2 from 'argon2';

import type { JwtPayload, UserDto, UserListResponse, UserStatus } from '@replaycoach/types';

import { User } from './user.entity';
import type { CreateUserDto, UpdateUserDto } from './user.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** `orgId`/`role` overrides let AuthService assign both from a redeemed
   * invite instead of the caller's self-selected values (see
   * AuthService.register) — an invite is the only thing that can hand out
   * anything other than the default org-less coach/student role. */
  async create(dto: CreateUserDto, overrides?: { orgId?: string | null }, manager?: Repository<User>): Promise<User> {
    const repo = manager ?? this.userRepo;
    const existing = await repo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = repo.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      role: dto.role,
      orgId: overrides?.orgId ?? null,
    });

    return repo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    return this.userRepo.save(user);
  }

  /** Self-service password change (an already-logged-in user, not the
   * token-based forgot/reset flow in AuthService). Requires the current
   * password to prevent a hijacked session from silently locking the real
   * owner out. Bumps sessionVersion — every other device gets logged out,
   * same as a suspend/reactivate or org-creation role change. */
  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    user.passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.userRepo.save(user);
    await this.incrementSessionVersion(id);
  }

  async incrementSessionVersion(id: string, manager?: Repository<User>): Promise<void> {
    const repo = manager ?? this.userRepo;
    await repo.increment({ id }, 'sessionVersion', 1);
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.userRepo.update({ id }, { lastLoginAt: new Date() });
  }

  /**
   * Admin-facing status change (suspend/reactivate/disable). Authorization
   * is org-scoped here, not just role-gated at the controller: platform_admin
   * can act on anyone; studio_admin can only act on members of their own org
   * and can never touch a platform_admin. Bumps sessionVersion so any
   * already-issued access token for the target is rejected immediately
   * (mirrors the logout invalidation pattern).
   */
  async setStatus(targetId: string, status: UserStatus, actingUser: JwtPayload): Promise<User> {
    const target = await this.findById(targetId);

    if (actingUser.role === 'platform_admin') {
      // full access
    } else if (actingUser.role === 'studio_admin') {
      if (target.orgId === null || target.orgId !== actingUser.orgId) {
        throw new ForbiddenException('You can only manage users in your own organization');
      }
      if (target.role === 'platform_admin') {
        throw new ForbiddenException('You cannot manage a platform admin');
      }
    } else {
      throw new ForbiddenException('Insufficient role');
    }

    target.status = status;
    await this.userRepo.save(target);
    await this.incrementSessionVersion(targetId);
    return target;
  }

  /** Self-service account deactivation — soft delete. TypeORM excludes
   * soft-deleted rows from normal find/findOne, so the account can no
   * longer authenticate (findByEmail/findById both start failing), without
   * needing a separate sessionVersion bump or refresh-token revocation. */
  async softDeleteSelf(id: string): Promise<void> {
    await this.userRepo.softDelete(id);
  }

  async listUsers(
    filter: { orgId?: string | undefined; role?: string | undefined; status?: string | undefined },
    page: number,
    pageSize: number,
    actingUser: JwtPayload,
  ): Promise<UserListResponse> {
    const where: FindOptionsWhere<User> = {};

    if (actingUser.role === 'platform_admin') {
      if (filter.orgId) where.orgId = filter.orgId;
    } else if (actingUser.role === 'studio_admin') {
      // A studio_admin can only ever see their own org, regardless of what
      // (if anything) they asked for — never trust a client-supplied orgId.
      if (!actingUser.orgId) return { items: [], total: 0, page, pageSize };
      where.orgId = actingUser.orgId;
    } else {
      throw new ForbiddenException('Insufficient role');
    }

    if (filter.role) where.role = filter.role as User['role'];
    if (filter.status) where.status = filter.status as User['status'];

    const safePageSize = Math.min(Math.max(1, pageSize || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const safePage = Math.max(1, page || 1);

    const [rows, total] = await this.userRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    });

    return {
      items: rows.map((u) => this.toDto(u)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  private profileCompleteness(user: User): number {
    const signals = [Boolean(user.avatarUrl), user.emailVerified];
    const complete = signals.filter(Boolean).length;
    return Math.round((complete / signals.length) * 100);
  }

  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      orgId: user.orgId,
      avatarUrl: user.avatarUrl,
      status: user.status,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      profileCompleteness: this.profileCompleteness(user),
      createdAt: user.createdAt.toISOString(),
    };
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

import type { UserDto } from '@replaycoach/types';

import { User } from './user.entity';
import type { CreateUserDto, UpdateUserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      role: dto.role,
      orgId: null,
    });

    return this.userRepo.save(user);
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

  async incrementSessionVersion(id: string): Promise<void> {
    await this.userRepo.increment({ id }, 'sessionVersion', 1);
  }

  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      orgId: user.orgId,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

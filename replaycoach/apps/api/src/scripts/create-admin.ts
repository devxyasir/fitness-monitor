/**
 * One-off CLI script to create (or promote) a platform_admin account —
 * there's no self-service path to this role by design (see
 * AuthService.register's comment on why a client-supplied role is never
 * trusted beyond the open coach/student self-signup default). Run it once
 * per deployment to bootstrap the first platform admin.
 *
 * Usage (from apps/api):
 *   pnpm create-admin admin@example.com 'a-strong-Password1' 'Admin Name'
 */
import * as argon2 from 'argon2';
import { AppDataSource } from '../database/data-source';
import { User } from '../users/user.entity';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const displayName = nameParts.join(' ');

  if (!email || !password || !displayName) {
    console.error('Usage: create-admin.ts <email> <password> <display name>');
    process.exit(1);
  }
  if (!PASSWORD_REGEX.test(password)) {
    console.error('Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a digit.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  const userRepo = AppDataSource.getRepository(User);

  const existing = await userRepo.findOne({ where: { email } });
  if (existing) {
    existing.role = 'platform_admin';
    existing.passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    existing.sessionVersion += 1; // invalidate any already-issued tokens for this account
    await userRepo.save(existing);
    console.log(`Promoted existing user ${email} to platform_admin and reset their password.`);
  } else {
    const user = userRepo.create({
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      displayName,
      role: 'platform_admin',
      orgId: null, // platform_admin is not scoped to any single organization
    });
    await userRepo.save(user);
    console.log(`Created platform_admin ${email}.`);
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

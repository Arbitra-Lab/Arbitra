import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/user.entity';

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole; mfaVerified?: boolean } }>();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const privilegedRoleRequested = requiredRoles.some(
      (role) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN,
    );
    if (
      privilegedRoleRequested &&
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) &&
      user.mfaVerified !== true
    ) {
      throw new ForbiddenException(
        'MFA verification required for admin access',
      );
    }

    return true;
  }
}

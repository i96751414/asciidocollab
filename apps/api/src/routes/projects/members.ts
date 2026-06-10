import type { FastifyInstance } from "fastify";
import {
  InviteUserUseCase,
  ChangeMemberRoleUseCase,
  RemoveMemberUseCase,
  UserId,
  ProjectId,
  Email,
  Role,
  DomainError,
  PermissionDeniedError,
  ProjectNotFoundError,
  UserNotFoundError,
  ProjectMemberAlreadyExistsError,
  MemberNotFoundError,
  CannotRemoveLastOwnerError,
} from "@asciidocollab/domain";
import { getAuthenticatedUserId } from "../../plugins/require-auth";
import { requestContextFrom } from "../../lib/request-context";
import { requestLogger } from "../../lib/request-logger";

function mapMemberError(error: DomainError): { status: number; code: string } {
  if (error instanceof PermissionDeniedError) return { status: 403, code: "FORBIDDEN" };
  if (error instanceof ProjectNotFoundError) return { status: 404, code: "NOT_FOUND" };
  if (error instanceof UserNotFoundError) return { status: 404, code: "USER_NOT_FOUND" };
  if (error instanceof MemberNotFoundError) return { status: 404, code: "MEMBER_NOT_FOUND" };
  if (error instanceof ProjectMemberAlreadyExistsError) return { status: 409, code: "ALREADY_A_MEMBER" };
  if (error instanceof CannotRemoveLastOwnerError) return { status: 409, code: "CANNOT_REMOVE_LAST_OWNER" };
  return { status: 400, code: "VALIDATION_ERROR" };
}

/**
 * Registers the project member management routes.
 *
 * @param app - The Fastify instance to register the routes on.
 */
export async function memberRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/projects/:id/members - List all members of a project.
   */
  app.get<{ Params: { id: string } }>("/api/projects/:id/members", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const sessionUserId = getAuthenticatedUserId(request);

    try {
      const callerMembership = await request.server.repos.projectMember.findByCompositeKey(
        ProjectId.create(id),
        UserId.create(sessionUserId),
      );
      if (!callerMembership) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not a member of this project" } });
      }

      const members = await request.server.repos.projectMember.findByProjectId(ProjectId.create(id));

      const users = await Promise.all(
        members.map((member) => request.server.repos.user.findById(member.userId)),
      );

      if (users.includes(null)) {
        return reply.status(500).send({
          error: { code: "INTERNAL_ERROR", message: "Failed to fetch member data" },
        });
      }

      return reply.status(200).send({
        data: {
          members: members.map((member, index) => ({
            userId: member.userId.value,
            email: users[index]!.email.value,
            displayName: users[index]!.displayName,
            role: member.role.value,
            joinedAt: member.joinedAt.toISOString(),
          })),
        },
      });
    } catch {
      return reply.status(500).send({
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch members" },
      });
    }
  });

  /**
   * POST /api/projects/:id/members - Invite a user to a project.
   */
  app.post<{ Params: { id: string }; Body: { email: string; role: "viewer" | "editor" | "owner" } }>("/api/projects/:id/members", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["email", "role"],
        properties: {
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["viewer", "editor", "owner"] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { email, role } = request.body;

    const sessionUserId = getAuthenticatedUserId(request);

    const useCase = new InviteUserUseCase(
      request.server.repos.user,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(
      UserId.create(sessionUserId),
      ProjectId.create(id),
      Email.create(email),
      Role.create(role),
    );

    if (!result.success) {
      const { status, code } = mapMemberError(result.error);
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    const { member, user: invitedUser } = result.value;

    return reply.status(201).send({
      data: {
        userId: invitedUser.id.value,
        email: invitedUser.email.value,
        displayName: invitedUser.displayName,
        role: role,
        joinedAt: member.joinedAt.toISOString(),
      },
    });
  });

  /**
   * PATCH /api/projects/:id/members/:userId - Update a member's role.
   */
  app.patch<{ Params: { id: string; userId: string }; Body: { role: "viewer" | "editor" | "owner" } }>("/api/projects/:id/members/:userId", {
    schema: {
      params: {
        type: "object",
        required: ["id", "userId"],
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
        },
      },
      body: {
        type: "object",
        required: ["role"],
        properties: {
          role: { type: "string", enum: ["viewer", "editor", "owner"] },
        },
      },
    },
  }, async (request, reply) => {
    const { id, userId } = request.params;
    const { role } = request.body;

    const sessionUserId = getAuthenticatedUserId(request);

    const useCase = new ChangeMemberRoleUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
      requestLogger(request),
    );

    const result = await useCase.execute(
      UserId.create(sessionUserId),
      ProjectId.create(id),
      UserId.create(userId),
      Role.create(role),
      requestContextFrom(request),
    );

    if (!result.success) {
      const { status, code } = mapMemberError(result.error);
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({ data: { userId, role } });
  });

  /**
   * DELETE /api/projects/:id/members/:userId - Remove a member from a project.
   */
  app.delete<{ Params: { id: string; userId: string } }>("/api/projects/:id/members/:userId", {
    schema: {
      params: {
        type: "object",
        required: ["id", "userId"],
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { id, userId } = request.params;
    const sessionUserId = getAuthenticatedUserId(request);

    const useCase = new RemoveMemberUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
      requestLogger(request),
    );

    const result = await useCase.execute(
      UserId.create(sessionUserId),
      ProjectId.create(id),
      UserId.create(userId),
      requestContextFrom(request),
    );

    if (!result.success) {
      const { status, code } = mapMemberError(result.error);
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({ data: { message: "Member removed successfully" } });
  });
}

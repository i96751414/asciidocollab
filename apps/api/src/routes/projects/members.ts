import type { FastifyInstance } from "fastify";
import { InviteUserUseCase, ChangeMemberRoleUseCase, RemoveMemberUseCase, UserId, ProjectId, Email, Role } from "@asciidocollab/domain";

/**
 * Registers the project member management routes.
 *
 * @param app - The Fastify instance to register the routes on.
 */
export async function memberRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/projects/:id/members - List all members of a project.
   */
  app.get("/api/projects/:id/members", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Get user ID from session
    const userId = request.session?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    }

    try {
      const members = await request.server.repos.projectMember.findByProjectId(
        ProjectId.create(id)
      );

      return reply.status(200).send({
        data: {
          members: members.map((member) => ({
            userId: member.userId.value,
            email: "user@example.com", // TODO: Fetch from user repository
            displayName: "User", // TODO: Fetch from user repository
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
  app.post("/api/projects/:id/members", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      body: {
        type: "object",
        required: ["email", "role"],
        properties: {
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["viewer", "editor", "administrator"] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { email, role } = request.body as {
      email: string;
      role: "viewer" | "editor" | "administrator";
    };

    // Get user ID from session
    const userId = request.session?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    }

    const useCase = new InviteUserUseCase(
      request.server.repos.user,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(
      UserId.create(userId),
      ProjectId.create(id),
      Email.create(email),
      Role.create(role),
    );

    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: result.error.message },
      });
    }

    return reply.status(201).send({
      data: {
        userId: "new-user-id", // TODO: Return actual user ID
        email: email,
        displayName: "User", // TODO: Fetch from user repository
        role: role,
        joinedAt: new Date().toISOString(),
      },
    });
  });

  /**
   * PATCH /api/projects/:id/members/:userId - Update a member's role.
   */
  app.patch("/api/projects/:id/members/:userId", {
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
          role: { type: "string", enum: ["viewer", "editor", "administrator"] },
        },
      },
    },
  }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const { role } = request.body as { role: "viewer" | "editor" | "administrator" };

    // Get user ID from session
    const sessionUserId = request.session?.userId;
    if (!sessionUserId) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    }

    const useCase = new ChangeMemberRoleUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(
      UserId.create(sessionUserId),
      ProjectId.create(id),
      UserId.create(userId),
      Role.create(role),
    );

    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: result.error.message },
      });
    }

    return reply.status(200).send({
      data: {
        userId: userId,
        role: role,
      },
    });
  });

  /**
   * DELETE /api/projects/:id/members/:userId - Remove a member from a project.
   */
  app.delete("/api/projects/:id/members/:userId", {
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
    const { id, userId } = request.params as { id: string; userId: string };

    // Get user ID from session
    const sessionUserId = request.session?.userId;
    if (!sessionUserId) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    }

    const useCase = new RemoveMemberUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(
      UserId.create(sessionUserId),
      ProjectId.create(id),
      UserId.create(userId),
    );

    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: result.error.message },
      });
    }

    return reply.status(200).send({
      data: {
        message: "Member removed successfully",
      },
    });
  });
}

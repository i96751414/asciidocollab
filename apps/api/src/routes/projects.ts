import type { FastifyInstance } from "fastify";
import {
  ListUserProjectsUseCase,
  CreateProjectUseCase,
  UpdateProjectUseCase,
  ArchiveProjectUseCase,
  RestoreProjectUseCase,
  DeleteProjectUseCase,
  ProjectName,
  ProjectId,
  UserId,
  DomainError,
  PermissionDeniedError,
  ProjectNotFoundError,
  ProjectAlreadyArchivedError,
  ProjectNotArchivedError,
} from "@asciidocollab/domain";
import { getAuthenticatedUserId } from "../plugins/require-auth";

/**
 * Maps domain errors to HTTP status codes and error codes.
 *
 * @param error - The domain error to map.
 * @returns Object with status code and error code.
 */
function mapDomainError(error: DomainError): { status: number; code: string } {
  if (error instanceof PermissionDeniedError) {
    return { status: 403, code: "FORBIDDEN" };
  }
  if (error instanceof ProjectNotFoundError) {
    return { status: 404, code: "NOT_FOUND" };
  }
  if (error instanceof ProjectAlreadyArchivedError) {
    return { status: 400, code: "ALREADY_ARCHIVED" };
  }
  if (error instanceof ProjectNotArchivedError) {
    return { status: 400, code: "NOT_ARCHIVED" };
  }
  return { status: 400, code: "VALIDATION_ERROR" };
}

/**
 * Registers the project management routes.
 *
 * @param app - The Fastify instance to register the routes on.
 */
export async function projectRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/projects - List all projects where the user is a member.
   */
  app.get<{ Querystring: { page?: number; limit?: number; archived?: boolean } }>("/api/projects", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          page: { type: "number", default: 1 },
          limit: { type: "number", default: 20 },
          archived: { type: "boolean", default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { page, limit, archived } = request.query;

    const userId = getAuthenticatedUserId(request);

    const useCase = new ListUserProjectsUseCase(request.server.repos.project);

    const result = await useCase.execute(
      UserId.create(userId),
      { page: page || 1, limit: limit || 20 },
      archived || false,
    );

    if (!result.success) {
      return reply.status(500).send({
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch projects" },
      });
    }

    const projectsWithData = await Promise.all(
      result.value.projects.map(async (project) => {
        const members = await request.server.repos.projectMember.findByProjectId(project.id);
        const memberCount = members.length;

        const userMembership = members.find((m) => m.userId.value === userId);

        const ownerMembers = members.filter((m) => m.role.value === 'owner');
        const ownerUsers = await Promise.all(
          ownerMembers.map((m) => request.server.repos.user.findById(m.userId)),
        );
        const owners = ownerUsers
          .filter((u): u is NonNullable<typeof u> => u !== null)
          .map((u) => ({ userId: u.id.value, displayName: u.displayName }));

        return {
          id: project.id.value,
          name: project.name.value,
          description: project.description,
          owners,
          tags: [...project.tags],
          rootFolderId: project.rootFolderId?.value ?? null,
          archivedAt: project.archivedAt?.toISOString() ?? null,
          memberCount,
          role: userMembership?.role.value ?? 'viewer',
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        };
      }),
    );

    return reply.status(200).send({
      data: projectsWithData,
      pagination: {
        page: result.value.page,
        limit: result.value.limit,
        total: result.value.total,
        totalPages: result.value.totalPages,
      },
    });
  });

  /**
   * GET /api/projects/:id - Get a single project.
   */
  app.get<{ Params: { id: string } }>("/api/projects/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = getAuthenticatedUserId(request);

    const project = await request.server.repos.project.findById(ProjectId.create(id));
    if (!project) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Project not found" } });
    }

    const members = await request.server.repos.projectMember.findByProjectId(ProjectId.create(id));
    const userMembership = members.find((m) => m.userId.value === userId);
    if (!userMembership) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this project' } });
    }
    const ownerMembers = members.filter((m) => m.role.value === 'owner');
    const ownerUsers = await Promise.all(
      ownerMembers.map((m) => request.server.repos.user.findById(m.userId)),
    );
    const owners = ownerUsers
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((u) => ({ userId: u.id.value, displayName: u.displayName }));

    return reply.status(200).send({
      data: {
        id: project.id.value,
        name: project.name.value,
        description: project.description,
        owners,
        tags: [...project.tags],
        rootFolderId: project.rootFolderId?.value ?? null,
        archivedAt: project.archivedAt?.toISOString() ?? null,
        role: userMembership.role.value,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
    });
  });

  /**
   * POST /api/projects - Create a new project.
   */
  app.post<{ Body: { name: string; description?: string; tags?: string[] } }>("/api/projects", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          description: { type: "string", maxLength: 1000 },
          tags: {
            type: "array",
            items: { type: "string", maxLength: 50 },
            maxItems: 10,
          },
        },
      },
    },
  }, async (request, reply) => {
    const { name, description, tags } = request.body;

    const userId = getAuthenticatedUserId(request);

    const useCase = new CreateProjectUseCase(
      request.server.repos.project,
      request.server.repos.fileNode,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(
      UserId.create(userId),
      ProjectName.create(name),
      description || null,
      tags || [],
    );

    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: result.error.message },
      });
    }

    return reply.status(201).send({
      data: {
        id: result.value.projectId.value,
        name: name,
        description: description || null,
        tags: tags || [],
        rootFolderId: result.value.rootFolderId.value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  /**
   * PATCH /api/projects/:id - Update a project.
   */
  app.patch<{ Params: { id: string }; Body: { name?: string; description?: string; tags?: string[] } }>("/api/projects/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          description: { type: "string", maxLength: 1000 },
          tags: {
            type: "array",
            items: { type: "string", maxLength: 50 },
            maxItems: 10,
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, description, tags } = request.body;

    const userId = getAuthenticatedUserId(request);

    const useCase = new UpdateProjectUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(
      UserId.create(userId),
      ProjectId.create(id),
      {
        name,
        description: description === undefined ? undefined : description,
        tags,
      },
    );

    if (!result.success) {
      const { status, code } = mapDomainError(result.error);
      return reply.status(status).send({
        error: { code, message: result.error.message },
      });
    }

    return reply.status(200).send({
      data: {
        id: result.value.id.value,
        name: result.value.name.value,
        description: result.value.description,
        tags: [...result.value.tags],
        updatedAt: result.value.updatedAt.toISOString(),
      },
    });
  });

  /**
   * POST /api/projects/:id/archive - Archive a project.
   */
  app.post<{ Params: { id: string } }>("/api/projects/:id/archive", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = getAuthenticatedUserId(request);

    const useCase = new ArchiveProjectUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(UserId.create(userId), ProjectId.create(id));

    if (!result.success) {
      const { status, code } = mapDomainError(result.error);
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({ data: { id, archivedAt: result.value.archivedAt.toISOString() } });
  });

  /**
   * POST /api/projects/:id/restore - Restore an archived project.
   */
  app.post<{ Params: { id: string } }>("/api/projects/:id/restore", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = getAuthenticatedUserId(request);

    const useCase = new RestoreProjectUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(UserId.create(userId), ProjectId.create(id));

    if (!result.success) {
      const { status, code } = mapDomainError(result.error);
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({ data: { id, archivedAt: null } });
  });

  /**
   * DELETE /api/projects/:id — Permanently delete a project. Owner only.
   */
  app.delete<{ Params: { id: string } }>("/api/projects/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = getAuthenticatedUserId(request);

    const useCase = new DeleteProjectUseCase(
      request.server.repos.project,
      request.server.repos.projectMember,
      request.server.repos.auditLog,
    );

    const result = await useCase.execute(UserId.create(userId), ProjectId.create(id));

    if (!result.success) {
      const { status, code } = mapDomainError(result.error);
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({ data: { id } });
  });
}

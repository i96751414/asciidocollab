/**
 * Project render-configuration API client. The project-level AsciiDoc / Asciidoctor-PDF options a
 * project applies to every render (HTML preview + PDF export). The option semantics are validated
 * server-side by the shared `renderConfigSchema`.
 */
import { apiRequest } from '@/lib/api/transport';
import type { RenderConfig } from '@asciidocollab/shared';

export const renderConfigApi = {
  /** Fetch the project's render configuration (an empty object when none is set). */
  async get(projectId: string): Promise<{ /** The project's render configuration. */ data: RenderConfig }> {
    return apiRequest(`/api/projects/${projectId}/render-config`);
  },

  /** Replace the project's render configuration (editor/owner only). */
  async save(
    projectId: string,
    config: RenderConfig,
  ): Promise<{ /** The saved render configuration. */ data: RenderConfig }> {
    return apiRequest(`/api/projects/${projectId}/render-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },
};

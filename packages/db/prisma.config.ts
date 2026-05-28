import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.ASCIIDOCOLLAB_DATABASE_URL ?? 'postgresql://localhost:5432/dev',
  },
});
